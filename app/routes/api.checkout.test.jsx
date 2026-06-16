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

export async function action({ request }) {
  if (request.method !== "POST") {
    return Response.json(
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
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 400 },
    );
  }

  try {
    const draftOrder = await createDraftShopifyOrderForCheckout(payload);
    const { customer, payment } = await createAsaasCheckoutPayment(payload);
    const shopifyDraftOrder = await attachAsaasPaymentToDraftOrder({
      draftOrder,
      asaasPaymentId: payment.id,
      asaasCustomerId: customer.id,
      value: payload.value,
      externalReference: payment.externalReference,
      invoiceUrl: payment.invoiceUrl,
    });

    return Response.json({
      success: true,
      paymentId: payment.id,
      invoiceUrl: payment.invoiceUrl,
      externalReference: payment.externalReference,
      draftOrderId: shopifyDraftOrder.draftOrderId,
      draftOrderName: shopifyDraftOrder.draftOrderName,
      shopifyOrderId: shopifyDraftOrder.shopifyOrderId,
      shopifyOrderName: shopifyDraftOrder.shopifyOrderName,
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
