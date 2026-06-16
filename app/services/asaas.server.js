import { getAsaasConfig } from "../config/asaas.server";
import { completeDraftOrderForAsaasPayment } from "./shopify-order.server";

const SUPPORTED_PAYMENT_WEBHOOK_EVENTS = new Set([
  "PAYMENT_CREATED",
  "PAYMENT_RECEIVED",
  "PAYMENT_CONFIRMED",
  "PAYMENT_OVERDUE",
  "PAYMENT_DELETED",
  "PAYMENT_REFUNDED",
  "PAYMENT_CHARGEBACK_REQUESTED",
  "PAYMENT_CHARGEBACK_DISPUTE",
  "PAYMENT_AWAITING_CHARGEBACK_REVERSAL",
]);

const APPROVED_PAYMENT_EVENTS = new Set([
  "PAYMENT_RECEIVED",
  "PAYMENT_CONFIRMED",
]);

function formatAsaasError(data) {
  if (typeof data === "string") {
    return data;
  }

  if (Array.isArray(data?.errors)) {
    return data.errors
      .map((error) =>
        [error.code, error.description].filter(Boolean).join(": "),
      )
      .join("; ");
  }

  return JSON.stringify(data);
}

function assertAsaasApiKey(apiKey) {
  if (!apiKey) {
    throw new Error("ASAAS_API_KEY is not configured.");
  }
}

function getTomorrowDate() {
  const date = new Date();
  date.setDate(date.getDate() + 1);

  return date.toISOString().slice(0, 10);
}

async function requestAsaas(path, options = {}) {
  const { apiKey, baseUrl } = getAsaasConfig();
  assertAsaasApiKey(apiKey);

  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      access_token: apiKey,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    throw new Error(formatAsaasError(data));
  }

  return data;
}

export async function findOrCreateAsaasCustomer({ name, email, cpfCnpj }) {
  const query = new URLSearchParams({ cpfCnpj });
  const customers = await requestAsaas(`/customers?${query.toString()}`);
  const existingCustomer = customers?.data?.[0];

  if (existingCustomer?.id) {
    return existingCustomer;
  }

  return requestAsaas("/customers", {
    method: "POST",
    body: JSON.stringify({
      name,
      email,
      cpfCnpj,
    }),
  });
}

export async function createAsaasPixPayment({
  customer,
  value,
  externalReference,
}) {
  return requestAsaas("/payments", {
    method: "POST",
    body: JSON.stringify({
      customer,
      billingType: "PIX",
      value,
      dueDate: getTomorrowDate(),
      description: "Iron Air Sandbox",
      externalReference,
    }),
  });
}

export async function createAsaasCheckoutPayment(payload) {
  const customer = await findOrCreateAsaasCustomer(payload);
  const payment = await createAsaasPixPayment({
    customer: customer.id,
    value: payload.value,
    externalReference: payload.externalReference,
  });

  return {
    customer,
    payment,
  };
}

export async function handleAsaasWebhook(payload) {
  const event = payload?.event;
  const payment = payload?.payment;

  if (!event || typeof event !== "string") {
    throw new Error("Invalid Asaas webhook payload: missing event.");
  }

  if (!SUPPORTED_PAYMENT_WEBHOOK_EVENTS.has(event)) {
    throw new Error(`Unsupported Asaas webhook event: ${event}.`);
  }

  if (!payment || typeof payment !== "object") {
    throw new Error("Invalid Asaas webhook payload: missing payment.");
  }

  const result = {
    ok: true,
    event,
    paymentId: payment.id,
    status: payment.status,
    value: payment.value,
    customer: payment.customer,
    externalReference: payment.externalReference,
  };

  if (APPROVED_PAYMENT_EVENTS.has(event)) {
    console.log("[asaas] Approved payment webhook:", {
      paymentId: payment.id,
      status: payment.status,
      value: payment.value,
      customer: payment.customer,
      billingType: payment.billingType,
      externalReference: payment.externalReference,
    });

    if (payment.externalReference === "shopify_test_order") {
      console.log("[SHOPIFY ORDER READY]");
      await completeDraftOrderForAsaasPayment(payment.id);
    }
  }

  return result;
}

export async function testAsaasConnection() {
  const { apiKey, baseUrl, env } = getAsaasConfig();

  console.log(`[asaas] Testing connection using ${env} environment.`);

  if (!apiKey) {
    return {
      success: false,
      environment: env,
      error: "ASAAS_API_KEY is not configured.",
    };
  }

  try {
    const response = await fetch(`${baseUrl}/myAccount`, {
      method: "GET",
      headers: {
        access_token: apiKey,
        "Content-Type": "application/json",
      },
    });

    const contentType = response.headers.get("content-type") || "";
    const data = contentType.includes("application/json")
      ? await response.json()
      : await response.text();

    if (!response.ok) {
      return {
        success: false,
        environment: env,
        error: formatAsaasError(data),
      };
    }

    return {
      success: true,
      environment: env,
      account: data,
    };
  } catch (error) {
    return {
      success: false,
      environment: env,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
