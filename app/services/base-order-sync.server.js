import prisma from "../db.server.js";
import { getBaseConfig } from "../config/base.server.js";
import {
  createBaseCustomer,
  createBaseOrder,
  getBaseCustomers,
  getBaseOrders,
} from "./base.server.js";

const digits = (value) => String(value || "").replace(/\D/g, "");

function getContent(page) {
  return Array.isArray(page?.content) ? page.content : [];
}

export function customerPayload(customer, document) {
  const payload = {
    name: customer.name,
    cpfCnpj: document,
    externalReference: `asaas:${customer.id}`,
    observations: "Sincronizado automaticamente do Asaas pelo Iron Air Payments",
    ...(document.length === 11
      ? {
          taxInformation: {
            stateInscription: "",
            typeOfTaxPayer: "NAO_CONTRIBUINTE",
            finalConsumer: true,
          },
        }
      : {}),
  };
  if (customer.email) payload.email = customer.email;
  if (customer.phone) payload.phone = customer.phone;
  if (customer.mobilePhone) payload.mobilePhone = customer.mobilePhone;
  const cityName = customer.cityName || (typeof customer.city === "string" ? customer.city : null);
  if (customer.postalCode && customer.address && customer.addressNumber && customer.province && cityName && customer.state) {
    payload.billingAddress = {
      postalCode: digits(customer.postalCode),
      address: customer.address,
      addressNumber: customer.addressNumber,
      ...(customer.complement ? { complement: customer.complement } : {}),
      province: customer.province,
      cityName,
      stateAbbrev: customer.state,
      country: "Brasil",
    };
  }
  return payload;
}

async function resolveBaseCustomer(customer) {
  let matches = getContent(await getBaseCustomers({ asaasId: customer.id, page: "0", size: "2" }));
  if (matches.length > 1) throw new Error("BASE_CUSTOMER_AMBIGUOUS_ASAAS_ID");
  if (matches[0]) return matches[0].id;

  const document = digits(customer.cpfCnpj);
  if (!document) throw new Error("BASE_CUSTOMER_DOCUMENT_REQUIRED");
  matches = getContent(await getBaseCustomers({ cpfCnpj: document, page: "0", size: "2" }));
  if (matches.length > 1) throw new Error("BASE_CUSTOMER_AMBIGUOUS_DOCUMENT");
  if (matches[0]) return matches[0].id;

  return (await createBaseCustomer(
    customerPayload(customer, document),
    `asaas-customer-${customer.id}`,
  )).id;
}

export function mappedProduct(checkoutData, productMap) {
  const items = Array.isArray(checkoutData?.items) ? checkoutData.items : [];
  if (items.length !== 1) throw new Error("BASE_SYNC_REQUIRES_ONE_PRODUCT_LINE");
  const item = items[0];
  const explicitSku = String(item.sku || "").trim().toUpperCase();
  const title = String(item.title || "").trim().toUpperCase();
  const variantTitle = String(item.variantTitle || "").trim().toUpperCase();
  const inferredSku = title === "IRON AIR" && ["127V", "220V"].includes(variantTitle)
    ? `IRON-AIR-${variantTitle}`
    : "";
  const sku = explicitSku || inferredSku;
  const productId = productMap[sku];
  if (!sku || !productId) throw new Error(`BASE_PRODUCT_MAPPING_MISSING:${sku || "NO_SKU"}`);
  return { productId, sku, quantity: Math.max(1, Number(item.quantity) || 1) };
}

export function billingType(value) {
  const type = String(value || "").toUpperCase();
  return ["BOLETO", "CREDIT_CARD", "DEBIT_CARD", "DEPOSIT", "PIX", "TRANSFER"].includes(type)
    ? type
    : "UNDEFINED";
}

export function paymentDueDate(value, issueDate) {
  const dueDate = String(value || "");
  return /^\d{4}-\d{2}-\d{2}$/.test(dueDate) && dueDate >= issueDate
    ? dueDate
    : issueDate;
}

export async function syncPaidOrderToBase(mappedOrder, { customer, payment, event }) {
  const config = getBaseConfig();
  if (!config.enabled) return { status: "DISABLED" };

  const claim = await prisma.asaasShopifyOrder.updateMany({
    where: { id: mappedOrder.id, baseSyncStatus: "PENDING", baseOrderId: null },
    data: { baseSyncStatus: "PROCESSING", baseSyncEvent: event, baseSyncError: null },
  });
  if (claim.count !== 1) {
    const current = await prisma.asaasShopifyOrder.findUnique({ where: { id: mappedOrder.id } });
    return { status: current?.baseSyncStatus || "UNKNOWN", baseOrderId: current?.baseOrderId };
  }

  try {
    const product = mappedProduct(mappedOrder.checkoutData, config.productMap);
    const baseCustomerId = await resolveBaseCustomer(customer);
    const externalReference = `asaas:${payment.id}`;
    const existing = getContent(await getBaseOrders({ externalReference, page: "0", size: "2" }));
    if (existing.length > 1) throw new Error("BASE_ORDER_AMBIGUOUS");
    const paymentValue = Number(payment.value);
    const saleTotal = Number(mappedOrder.value || payment.value);
    const issueDate = new Date().toISOString().slice(0, 10);
    if (!Number.isFinite(paymentValue) || paymentValue <= 0) throw new Error("BASE_PAYMENT_VALUE_INVALID");
    if (!Number.isFinite(saleTotal) || saleTotal <= 0) throw new Error("BASE_SALE_VALUE_INVALID");

    const order = existing[0] || await createBaseOrder({
      issueDate,
      customerId: baseCustomerId,
      externalReference,
      observations: `Origem: Asaas | cobrança: ${payment.id}`,
      typeOfShipping: "SEM_FRETE",
      orderItems: [{ productId: product.productId, quantity: product.quantity, unitPrice: saleTotal / product.quantity }],
      orderPayments: [{
        // SEFAZ rejects an NF-e duplicate whose due date predates issuance.
        // Keep a valid future Asaas due date; otherwise use the Base order date.
        dueDate: paymentDueDate(payment.dueDate, issueDate),
        value: paymentValue,
        bankId: config.bankId,
        billingType: billingType(payment.billingType),
        paymentId: payment.id,
      }],
    }, `asaas-payment-${payment.id}`);

    await prisma.asaasShopifyOrder.update({
      where: { id: mappedOrder.id },
      data: {
        baseOrderId: order.id,
        baseCustomerId,
        baseSyncStatus: "SYNCED",
        baseSyncError: null,
        baseSyncedAt: new Date(),
      },
    });
    return { status: "SYNCED", baseOrderId: order.id, baseCustomerId };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.asaasShopifyOrder.update({
      where: { id: mappedOrder.id },
      data: { baseSyncStatus: "FAILED", baseSyncError: message.slice(0, 1000) },
    });
    console.error("[base sync] Paid order sync failed; automatic retry is disabled.", {
      orderId: mappedOrder.id,
      paymentId: payment?.id,
      error: message,
    });
    return { status: "FAILED", error: message };
  }
}
