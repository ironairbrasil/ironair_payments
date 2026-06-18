import crypto from "node:crypto";

import { createAsaasCheckoutForCustomCheckout } from "./asaas.server";
import { attachAsaasPaymentToDraftOrder } from "./shopify-order.server";
import {
  createDraftShopifyOrderForIronAirCheckout,
  deleteDraftShopifyOrder,
  findAsaasShopifyOrderByExternalReference,
  markDraftOrderAsFailed,
} from "./shopify-order.server";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UF_PATTERN = /^[A-Z]{2}$/;

function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function requireText(source, field, label = field) {
  const value = String(source?.[field] || "").trim();

  if (!value) {
    throw new Error(`Campo obrigatorio: ${label}.`);
  }

  return value;
}

function normalizeVariantGid(variantId) {
  const text = String(variantId || "");

  if (text.startsWith("gid://shopify/ProductVariant/")) {
    return text;
  }

  return `gid://shopify/ProductVariant/${text.replace(/\D/g, "")}`;
}

function sanitizeForLog(value) {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForLog(item));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => {
      if (["email", "cpfCnpj", "phone"].includes(key)) {
        const text = String(item || "");
        return [key, text.length > 4 ? `${text.slice(0, 3)}***${text.slice(-2)}` : "***"];
      }

      return [key, sanitizeForLog(item)];
    }),
  );
}

export function normalizeIronAirCheckoutPayload(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Payload inválido.");
  }

  const customer = payload.customer || {};
  const shippingAddress = payload.shippingAddress || {};
  const billingAddress = payload.billingAddress || shippingAddress;
  const normalizedCustomer = {
    name: requireText(customer, "name", "nome completo"),
    email: requireText(customer, "email", "email").toLowerCase(),
    cpfCnpj: onlyDigits(requireText(customer, "cpfCnpj", "CPF")),
    phone: onlyDigits(requireText(customer, "phone", "telefone")),
  };

  if (!EMAIL_PATTERN.test(normalizedCustomer.email)) {
    throw new Error("Email inválido.");
  }

  if (normalizedCustomer.cpfCnpj.length < 11) {
    throw new Error("CPF inválido.");
  }

  if (normalizedCustomer.phone.length < 10) {
    throw new Error("Telefone inválido.");
  }

  const normalizedShippingAddress = {
    postalCode: onlyDigits(requireText(shippingAddress, "postalCode", "CEP")),
    address1: requireText(shippingAddress, "address1", "endereço"),
    number: requireText(shippingAddress, "number", "numero"),
    complement: String(shippingAddress.complement || "").trim(),
    neighborhood: requireText(shippingAddress, "neighborhood", "bairro"),
    city: requireText(shippingAddress, "city", "cidade"),
    provinceCode: requireText(shippingAddress, "provinceCode", "estado").toUpperCase(),
    countryCode: "BR",
    phone: normalizedCustomer.phone,
  };

  if (normalizedShippingAddress.postalCode.length !== 8) {
    throw new Error("CEP inválido.");
  }

  if (!UF_PATTERN.test(normalizedShippingAddress.provinceCode)) {
    throw new Error("Estado/UF inválido.");
  }

  const normalizedBillingAddress = {
    ...normalizedShippingAddress,
    ...billingAddress,
    postalCode: onlyDigits(billingAddress.postalCode || normalizedShippingAddress.postalCode),
    provinceCode: String(
      billingAddress.provinceCode || normalizedShippingAddress.provinceCode,
    ).toUpperCase(),
    countryCode: "BR",
    phone: normalizedCustomer.phone,
  };
  const items = Array.isArray(payload.items) ? payload.items : [];

  if (!items.length) {
    throw new Error("Carrinho vazio.");
  }

  const normalizedItems = items.map((item) => {
    const quantity = Math.max(1, Number(item.quantity) || 1);
    const variantId = normalizeVariantGid(requireText(item, "variantId", "variantId"));

    return {
      variantId,
      title: String(item.title || "").trim(),
      quantity,
      price: Number(item.price) || 0,
      image: String(item.image || "").trim(),
    };
  });

  return {
    externalReference:
      String(payload.externalReference || "").trim() ||
      `ironair_${Date.now()}_${crypto.randomUUID()}`,
    customer: normalizedCustomer,
    shippingAddress: normalizedShippingAddress,
    billingAddress: normalizedBillingAddress,
    items: normalizedItems,
  };
}

export async function createIronAirCheckout(payload) {
  const normalizedPayload = normalizeIronAirCheckoutPayload(payload);
  const existingOrder = await findAsaasShopifyOrderByExternalReference(
    normalizedPayload.externalReference,
  );

  if (existingOrder?.asaasCheckoutUrl) {
    return {
      checkoutUrl: existingOrder.asaasCheckoutUrl,
      externalReference: existingOrder.externalReference,
      draftOrderId: existingOrder.draftOrderId,
      draftOrderName: existingOrder.draftOrderName,
      reused: true,
    };
  }

  let draftOrder;
  let verifiedItems;
  let totalValue;

  const draftResult = await createDraftShopifyOrderForIronAirCheckout(
    normalizedPayload,
  );
  draftOrder = draftResult.draftOrder;
  verifiedItems = draftResult.items;
  totalValue = draftResult.value;

  try {
    const asaasResult = await createAsaasCheckoutForCustomCheckout({
      customer: normalizedPayload.customer,
      shippingAddress: normalizedPayload.shippingAddress,
      externalReference: normalizedPayload.externalReference,
      items: verifiedItems,
    });
    const checkout = asaasResult.checkout;
    const mappedOrder = await attachAsaasPaymentToDraftOrder({
      draftOrder,
      asaasPaymentId: checkout.id,
      asaasCheckoutId: checkout.id,
      asaasCustomerId: checkout.customer,
      value: totalValue,
      externalReference:
        checkout.externalReference || normalizedPayload.externalReference,
      invoiceUrl: null,
      checkoutUrl: asaasResult.checkoutUrl,
      customer: normalizedPayload.customer,
      shippingAddress: normalizedPayload.shippingAddress,
    });

    console.log("[ironair checkout] Payloads sent.", {
      shopify: "See [SHOPIFY CUSTOM CHECKOUT DRAFT PAYLOAD]",
      asaas: sanitizeForLog({
        customer: normalizedPayload.customer,
        shippingAddress: normalizedPayload.shippingAddress,
        externalReference: normalizedPayload.externalReference,
        items: verifiedItems,
      }),
    });

    return {
      checkoutUrl: asaasResult.checkoutUrl,
      checkoutId: checkout.id,
      externalReference: mappedOrder.externalReference,
      draftOrderId: mappedOrder.draftOrderId,
      draftOrderName: mappedOrder.draftOrderName,
      reused: false,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);

    try {
      await deleteDraftShopifyOrder(draftOrder.id);
    } finally {
      await markDraftOrderAsFailed({
        draftOrder,
        externalReference: normalizedPayload.externalReference,
        value: totalValue || 0,
        reason,
      });
    }

    throw error;
  }
}
