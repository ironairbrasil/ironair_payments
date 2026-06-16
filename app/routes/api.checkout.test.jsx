import { createAsaasCheckoutPayment } from "../services/asaas.server";
import {
  attachAsaasPaymentToDraftOrder,
  createDraftShopifyOrderForCheckout,
} from "../services/shopify-order.server";

const DEFAULT_CHECKOUT_PAYLOAD = {
  name: "Cliente Teste",
  email: "teste@ironair.com",
  cpfCnpj: "12345678909",
  value: 99.9,
  externalReference: "shopify_test_order",
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://ironair.com.br",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept",
};

function json(data, init = {}) {
  return Response.json(data, {
    ...init,
    headers: {
      ...CORS_HEADERS,
      ...(init.headers || {}),
    },
  });
}

function normalizeCheckoutPayload(payload) {
  return {
    ...DEFAULT_CHECKOUT_PAYLOAD,
    ...payload,
    value: Number(payload?.value ?? DEFAULT_CHECKOUT_PAYLOAD.value),
  };
}

function validateCheckoutPayload(payload) {
  const requiredFields = ["name", "email", "cpfCnpj", "externalReference"];
  const missingField = requiredFields.find((field) => !payload[field]);

  if (missingField) {
    throw new Error(`Missing required field: ${missingField}.`);
  }

  if (!Number.isFinite(payload.value) || payload.value <= 0) {
    throw new Error("Invalid value.");
  }
}

export async function loader({ request }) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: CORS_HEADERS,
    });
  }

  return json(
    {
      success: false,
      error: "Method not allowed. Use POST.",
    },
    { status: 405 },
  );
}

export async function action({ request }) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: CORS_HEADERS,
    });
  }

  if (request.method !== "POST") {
    return json(
      {
        success: false,
        error: "Method not allowed. Use POST.",
      },
      { status: 405 },
    );
  }

  let payload;

  try {
    payload = normalizeCheckoutPayload(await request.json());
    validateCheckoutPayload(payload);
  } catch (error) {
    return json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 400 },
    );
  }

  try {
    const draftOrder = await createDraftShopifyOrderForCheckout(payload);
    const { customer, payment, checkout, checkoutUrl, usedCheckoutFallback } =
      await createAsaasCheckoutPayment(payload);
    const asaasReferenceId = checkout?.id ?? payment.id;
    const externalReference =
      checkout?.externalReference ??
      payment?.externalReference ??
      payload.externalReference;
    const shopifyDraftOrder = await attachAsaasPaymentToDraftOrder({
      draftOrder,
      asaasPaymentId: asaasReferenceId,
      asaasCheckoutId: checkout?.id,
      asaasCustomerId: customer.id,
      value: payload.value,
      externalReference,
      invoiceUrl: checkoutUrl,
      checkoutUrl: checkout?.checkoutUrl,
    });

    return json({
      success: true,
      paymentId: payment?.id ?? null,
      checkoutId: checkout?.id ?? null,
      checkoutUrl,
      invoiceUrl: usedCheckoutFallback ? payment.invoiceUrl : null,
      usedCheckoutFallback,
      externalReference,
      draftOrderId: shopifyDraftOrder.draftOrderId,
      draftOrderName: shopifyDraftOrder.draftOrderName,
      shopifyOrderId: shopifyDraftOrder.shopifyOrderId,
      shopifyOrderName: shopifyDraftOrder.shopifyOrderName,
    });
  } catch (error) {
    return json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
