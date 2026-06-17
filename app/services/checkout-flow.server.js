import { createAsaasCheckoutPayment } from "./asaas.server";
import {
  attachAsaasPaymentToDraftOrder,
  createDraftShopifyOrderForCheckout,
  deleteDraftShopifyOrder,
  findAsaasShopifyOrderByExternalReference,
  markDraftOrderAsFailed,
} from "./shopify-order.server";

export const CHECKOUT_CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://ironair.com.br",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept",
};

export function checkoutJson(data, init = {}) {
  return Response.json(data, {
    ...init,
    headers: {
      ...CHECKOUT_CORS_HEADERS,
      ...(init.headers || {}),
    },
  });
}

function normalizeVariantGid(item) {
  if (item.variantGid) {
    return String(item.variantGid);
  }

  if (!item.variantId) {
    return null;
  }

  return `gid://shopify/ProductVariant/${String(item.variantId).replace(/\D/g, "")}`;
}

function normalizeRealCheckoutItems(payload) {
  const rawItems = Array.isArray(payload.items) && payload.items.length
    ? payload.items
    : [
        {
          variantId: payload.variantId,
          variantGid: payload.variantGid,
          quantity: payload.quantity,
          productHandle: payload.productHandle,
          price: payload.price,
          linePrice: payload.linePrice,
          sku: payload.sku,
        },
      ];

  return rawItems.map((item) => ({
    ...item,
    variantGid: normalizeVariantGid(item),
    quantity: Number(item.quantity),
    productHandle: item.productHandle ? String(item.productHandle) : "",
  }));
}

function requireField(payload, field) {
  if (!payload[field]) {
    throw new Error(`Missing required field: ${field}.`);
  }
}

export function normalizeRealCheckoutPayload(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid JSON payload.");
  }

  const normalizedPayload = {
    ...payload,
    value: Number(payload.value),
    items: normalizeRealCheckoutItems(payload),
  };

  for (const field of ["externalReference"]) {
    requireField(normalizedPayload, field);
  }

  if (!Number.isFinite(normalizedPayload.value) || normalizedPayload.value <= 0) {
    throw new Error("Invalid value.");
  }

  const invalidItem = normalizedPayload.items.find(
    (item) =>
      !item.variantGid ||
      !Number.isInteger(item.quantity) ||
      item.quantity <= 0 ||
      !item.productHandle ||
      (!Number(item.price) && !Number(item.linePrice)),
  );

  if (invalidItem || !normalizedPayload.items.length) {
    throw new Error(
      "Checkout requires real items with variantId or variantGid, quantity, productHandle, and price or linePrice.",
    );
  }

  return normalizedPayload;
}

function serializeExistingCheckout(existingOrder) {
  const isPaid = existingOrder.status === "PAID";

  return {
    success: true,
    reused: true,
    status: existingOrder.status,
    paid: isPaid,
    paymentId: existingOrder.asaasPaymentId,
    checkoutId: existingOrder.asaasCheckoutId,
    checkoutUrl: existingOrder.asaasCheckoutUrl,
    externalReference: existingOrder.externalReference,
    draftOrderId: existingOrder.draftOrderId,
    draftOrderName: existingOrder.draftOrderName,
    shopifyOrderId: existingOrder.shopifyOrderId,
    shopifyOrderName: existingOrder.shopifyOrderName,
    failureReason: existingOrder.failureReason,
  };
}

export async function startCheckoutFlow(payload, options = {}) {
  const existingOrder = await findAsaasShopifyOrderByExternalReference(
    payload.externalReference,
  );

  if (existingOrder) {
    return serializeExistingCheckout(existingOrder);
  }

  const draftOrder = await createDraftShopifyOrderForCheckout(payload, options);

  let asaasResult;

  try {
    asaasResult = await createAsaasCheckoutPayment(payload);
  } catch (error) {
    const failureReason = error instanceof Error ? error.message : String(error);

    try {
      await deleteDraftShopifyOrder(draftOrder.id);
    } finally {
      await markDraftOrderAsFailed({
        draftOrder,
        externalReference: payload.externalReference,
        value: payload.value,
        reason: failureReason,
      });
    }

    throw error;
  }

  const { checkout, checkoutUrl } = asaasResult;
  const externalReference = checkout?.externalReference ?? payload.externalReference;
  const shopifyDraftOrder = await attachAsaasPaymentToDraftOrder({
    draftOrder,
    asaasPaymentId: checkout.id,
    asaasCheckoutId: checkout?.id,
    asaasCustomerId: checkout?.customer,
    value: payload.value,
    externalReference,
    invoiceUrl: null,
    checkoutUrl,
  });

  return {
    success: true,
    reused: false,
    status: shopifyDraftOrder.status,
    checkoutId: checkout?.id ?? null,
    checkoutUrl,
    externalReference,
    draftOrderId: shopifyDraftOrder.draftOrderId,
    draftOrderName: shopifyDraftOrder.draftOrderName,
    shopifyOrderId: shopifyDraftOrder.shopifyOrderId,
    shopifyOrderName: shopifyDraftOrder.shopifyOrderName,
  };
}
