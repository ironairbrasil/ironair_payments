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
  "CHECKOUT_CREATED",
  "CHECKOUT_CANCELED",
  "CHECKOUT_EXPIRED",
  "CHECKOUT_PAID",
]);

const APPROVED_PAYMENT_EVENTS = new Set([
  "PAYMENT_RECEIVED",
  "PAYMENT_CONFIRMED",
  "CHECKOUT_PAID",
]);

const CHECKOUT_CALLBACK_URLS = {
  successUrl: "https://ironair-payments.vercel.app/checkout/success",
  cancelUrl: "https://ironair-payments.vercel.app/checkout/error",
  expiredUrl: "https://ironair-payments.vercel.app/checkout/error",
};

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

function getCheckoutUrl(checkout) {
  if (checkout?.link) {
    return checkout.link;
  }

  const { env } = getAsaasConfig();
  const checkoutBaseUrl =
    env === "production" ? "https://asaas.com" : "https://sandbox.asaas.com";

  return `${checkoutBaseUrl}/checkoutSession/show?id=${checkout.id}`;
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

export async function createAsaasCheckout({
  customerId,
  value,
  description,
  externalReference,
  billingTypes = ["PIX", "CREDIT_CARD", "BOLETO"],
}) {
  const checkout = await requestAsaas("/checkouts", {
    method: "POST",
    body: JSON.stringify({
      customer: customerId,
      billingTypes,
      chargeTypes: ["DETACHED"],
      minutesToExpire: 1440,
      externalReference,
      callback: CHECKOUT_CALLBACK_URLS,
      items: [
        {
          name: "Iron Air Sandbox",
          description,
          quantity: 1,
          value,
        },
      ],
    }),
  });

  return {
    ...checkout,
    checkoutUrl: getCheckoutUrl(checkout),
  };
}

export async function createAsaasCheckoutPayment(payload) {
  const customer = await findOrCreateAsaasCustomer(payload);

  try {
    let checkout;

    try {
      checkout = await createAsaasCheckout({
        customerId: customer.id,
        value: payload.value,
        description: "Teste Iron Air Sandbox",
        externalReference: payload.externalReference,
      });
    } catch (error) {
      console.warn("[asaas] Hosted checkout with boleto unavailable, retrying.", {
        error: error instanceof Error ? error.message : String(error),
        externalReference: payload.externalReference,
      });

      checkout = await createAsaasCheckout({
        customerId: customer.id,
        value: payload.value,
        description: "Teste Iron Air Sandbox",
        externalReference: payload.externalReference,
        billingTypes: ["PIX", "CREDIT_CARD"],
      });
    }

    return {
      customer,
      checkout,
      payment: null,
      checkoutUrl: checkout.checkoutUrl,
      usedCheckoutFallback: false,
    };
  } catch (error) {
    console.warn("[asaas] Hosted checkout unavailable, using invoice fallback.", {
      error: error instanceof Error ? error.message : String(error),
      externalReference: payload.externalReference,
    });

    const payment = await createAsaasPixPayment({
      customer: customer.id,
      value: payload.value,
      externalReference: payload.externalReference,
    });

    return {
      customer,
      payment,
      checkout: null,
      checkoutUrl: payment.invoiceUrl,
      usedCheckoutFallback: true,
    };
  }
}

export async function handleAsaasWebhook(payload) {
  const event = payload?.event;
  const payment = payload?.payment;
  const checkout = payload?.checkout;

  if (!event || typeof event !== "string") {
    throw new Error("Invalid Asaas webhook payload: missing event.");
  }

  if (!SUPPORTED_PAYMENT_WEBHOOK_EVENTS.has(event)) {
    throw new Error(`Unsupported Asaas webhook event: ${event}.`);
  }

  if (!payment && !checkout) {
    throw new Error("Invalid Asaas webhook payload: missing payment or checkout.");
  }

  const result = {
    ok: true,
    event,
    paymentId: payment?.id,
    checkoutId: checkout?.id,
    status: payment?.status ?? checkout?.status,
    value: payment?.value,
    customer: payment?.customer ?? checkout?.customer,
    externalReference: payment?.externalReference ?? checkout?.externalReference,
  };

  if (APPROVED_PAYMENT_EVENTS.has(event)) {
    console.log("[asaas] Approved payment webhook:", {
      paymentId: payment?.id,
      checkoutId: checkout?.id,
      status: payment?.status ?? checkout?.status,
      value: payment?.value,
      customer: payment?.customer ?? checkout?.customer,
      billingType: payment?.billingType,
      externalReference: payment?.externalReference ?? checkout?.externalReference,
    });

    console.log("[SHOPIFY ORDER READY]");
    await completeDraftOrderForAsaasPayment(payment?.id, {
      asaasCheckoutId: checkout?.id,
      externalReference: payment?.externalReference ?? checkout?.externalReference,
    });
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
