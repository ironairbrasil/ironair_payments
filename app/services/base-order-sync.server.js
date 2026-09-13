import prisma from "../db.server.js";
import { getBaseConfig } from "../config/base.server.js";
import {
  createBaseCustomer,
  createBaseOrder,
  getBaseCustomers,
  getBaseOrders,
  updateBaseCustomer,
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

export async function resolveBaseCustomer(customer) {
  let matches = getContent(await getBaseCustomers({ asaasId: customer.id, page: "0", size: "2" }));
  if (matches.length > 1) throw new Error("BASE_CUSTOMER_AMBIGUOUS_ASAAS_ID");
  const document = digits(customer.cpfCnpj);
  if (!document) throw new Error("BASE_CUSTOMER_DOCUMENT_REQUIRED");
  if (matches[0]) {
    await updateBaseCustomer(matches[0].id, customerPayload(customer, document));
    return matches[0].id;
  }

  matches = getContent(await getBaseCustomers({ cpfCnpj: document, page: "0", size: "2" }));
  if (matches.length > 1) throw new Error("BASE_CUSTOMER_AMBIGUOUS_DOCUMENT");
  if (matches[0]) {
    await updateBaseCustomer(matches[0].id, customerPayload(customer, document));
    return matches[0].id;
  }

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
  const variantId = String(item.variantId || "").replace(/\D/g, "");
  const legacyVariantSku = {
    "52109245186349": "IRON-AIR-127V",
    "52109245219117": "IRON-AIR-220V",
  }[variantId] || "";
  const inferredSku = title === "IRON AIR" && ["127V", "220V"].includes(variantTitle)
    ? `IRON-AIR-${variantTitle}`
    : legacyVariantSku;
  const sku = explicitSku || inferredSku;
  const productId = productMap[sku];
  if (!sku || !productId) throw new Error(`BASE_PRODUCT_MAPPING_MISSING:${sku || "NO_SKU"}`);
  const quantity = Math.max(1, Number(item.quantity) || 1);
  const unitPrice = Number(item.price);
  return {
    productId,
    sku,
    quantity,
    unitPrice: Number.isFinite(unitPrice) && unitPrice > 0 ? unitPrice : null,
  };
}

export function baseFinancialPayload(mappedOrder, payment, product) {
  const saleTotal = Number(mappedOrder.value);
  const unitPrice = Number(product.unitPrice);
  const quantity = Number(product.quantity);
  const productSubtotal = unitPrice * quantity;
  const discountAmount = Number(mappedOrder.discountAmount || 0);
  const shippingAmount = Number(mappedOrder.shippingPrice || 0);
  const expectedSaleTotal = productSubtotal - discountAmount + shippingAmount;

  if (!Number.isFinite(saleTotal) || saleTotal <= 0) {
    throw new Error("BASE_SALE_VALUE_INVALID");
  }
  if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
    throw new Error("BASE_SHOPIFY_UNIT_PRICE_REQUIRED");
  }
  if (
    !Number.isFinite(expectedSaleTotal) ||
    Math.round(expectedSaleTotal * 100) !== Math.round(saleTotal * 100)
  ) {
    throw new Error("BASE_FINANCIAL_TOTAL_MISMATCH");
  }
  // The locally available Base contract only proves support for item unitPrice
  // and payment value. Until sandbox validates native adjustment fields, do not
  // silently encode discount or freight only in observations.
  if (Math.round(discountAmount * 100) !== 0 || Math.round(shippingAmount * 100) !== 0) {
    throw new Error("BASE_ADJUSTMENTS_UNSUPPORTED_BY_VERIFIED_CONTRACT");
  }

  return {
    saleTotal,
    orderItem: {
      productId: product.productId,
      quantity: product.quantity,
      unitPrice,
    },
    orderPaymentValue: saleTotal,
    asaasPaymentId: String(payment.id || ""),
    asaasInstallmentValue: Number(payment.value),
    installmentCount: Number(payment.installmentCount || 1),
    discountAmount,
    shippingAmount,
  };
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

export function baseSalesOrderPayload({ issueDate, baseCustomerId, payment, financial }) {
  return {
    issueDate,
    customerId: baseCustomerId,
    externalReference: `asaas:${payment.id}`,
    observations: [
      `Origem: Asaas | cobrança paga: ${payment.id}`,
      `Parcelamento: ${financial.installmentCount}x | total: ${financial.saleTotal.toFixed(2)}`,
      `Desconto: ${financial.discountAmount.toFixed(2)} | frete: ${financial.shippingAmount.toFixed(2)}`,
    ].join(" | "),
    typeOfShipping: "SEM_FRETE",
    orderItems: [financial.orderItem],
    // Do not send orderPayments for an Asaas charge that is already confirmed.
    // Base treats that array as a request to create or edit receivables; linking
    // the confirmed card charge is rejected and omitting its id creates a duplicate.
  };
}

export async function syncPaidOrderToBase(mappedOrder, { customer, payment, event }) {
  const config = getBaseConfig();
  if (!config.enabled) return { status: "DISABLED" };

  const staleProcessingBefore = new Date(Date.now() - 5 * 60 * 1000);
  const claim = await prisma.asaasShopifyOrder.updateMany({
    where: {
      id: mappedOrder.id,
      baseOrderId: null,
      OR: [
        { baseSyncStatus: "PENDING" },
        { baseSyncStatus: "FAILED", updatedAt: { lt: staleProcessingBefore } },
        { baseSyncStatus: "PROCESSING", updatedAt: { lt: staleProcessingBefore } },
      ],
    },
    data: { baseSyncStatus: "PROCESSING", baseSyncEvent: event, baseSyncError: null },
  });
  if (claim.count !== 1) {
    const current = await prisma.asaasShopifyOrder.findUnique({ where: { id: mappedOrder.id } });
    return { status: current?.baseSyncStatus || "UNKNOWN", baseOrderId: current?.baseOrderId };
  }

  try {
    const product = mappedProduct(mappedOrder.checkoutData, config.productMap);
    // Validate accounting before customer lookup/update, because customer
    // resolution itself may write to Base.
    const financial = baseFinancialPayload(mappedOrder, payment, product);
    const baseCustomerId = await resolveBaseCustomer(customer);
    const externalReference = `asaas:${payment.id}`;
    const existing = getContent(await getBaseOrders({ externalReference, page: "0", size: "2" }));
    if (existing.length > 1) throw new Error("BASE_ORDER_AMBIGUOUS");
    const issueDate = new Date().toISOString().slice(0, 10);

    const order = existing[0] || await createBaseOrder(
      baseSalesOrderPayload({ issueDate, baseCustomerId, payment, financial }),
      `asaas-payment-${payment.id}`,
    );

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
    console.error("[base sync] Paid order sync failed; a later confirmation can retry it.", {
      orderId: mappedOrder.id,
      paymentId: payment?.id,
      error: message,
    });
    return { status: "FAILED", error: message };
  }
}
