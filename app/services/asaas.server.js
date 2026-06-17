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

function getCheckoutCallbackUrls() {
  const { appUrl } = getAsaasConfig();
  const fallbackAppUrl =
    process.env.NODE_ENV === "production"
      ? null
      : "http://localhost:3000";
  const baseUrl = appUrl || fallbackAppUrl;

  if (!baseUrl) {
    throw new Error("APP_URL is not configured.");
  }

  return {
    successUrl: `${baseUrl}/checkout/success`,
    cancelUrl: `${baseUrl}/checkout/error`,
    expiredUrl: `${baseUrl}/checkout/error`,
  };
}

function getAsaasDescription() {
  return getAsaasConfig().env === "production"
    ? "Iron Air payment"
    : "Iron Air Sandbox";
}

function assertAsaasApiKey(apiKey) {
  if (!apiKey) {
    throw new Error("ASAAS_API_KEY is not configured.");
  }
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

export async function createAsaasCheckout({
  items,
  externalReference,
  billingTypes = ["PIX", "CREDIT_CARD"],
}) {
  const checkoutPayload = {
    billingTypes,
    chargeTypes: ["DETACHED"],
    minutesToExpire: 1440,
    externalReference,
    callback: getCheckoutCallbackUrls(),
    items,
  };

  const checkout = await requestAsaas("/checkouts", {
    method: "POST",
    body: JSON.stringify(checkoutPayload),
  });

  return {
    ...checkout,
    checkoutUrl: getCheckoutUrl(checkout),
  };
}

export async function createAsaasCheckoutPayment(payload) {
  const checkoutItems = payload.items.map((item) => {
    const quantity = Math.max(1, Number(item.quantity) || 1);
    const linePrice = Number(item.linePrice);
    const unitPrice = Number(item.price);
    const value =
      Number.isFinite(unitPrice) && unitPrice > 0
        ? unitPrice
        : linePrice / quantity;

    if (!Number.isFinite(value) || value <= 0) {
      throw new Error("Invalid item value.");
    }

    return {
      name: String(item.productHandle || getAsaasDescription()),
      description: item.variantGid || item.variantId || getAsaasDescription(),
      quantity,
      value,
    };
  });

  try {
    const checkout = await createAsaasCheckout({
      items: checkoutItems,
      externalReference: payload.externalReference,
      billingTypes: ["PIX", "CREDIT_CARD", "BOLETO"],
    });

    return {
      checkout,
      checkoutUrl: checkout.checkoutUrl,
    };
  } catch (error) {
    console.warn("[asaas] Hosted checkout with boleto unavailable, retrying.", {
      error: error instanceof Error ? error.message : String(error),
      externalReference: payload.externalReference,
    });
  }

  try {
    const checkout = await createAsaasCheckout({
      items: checkoutItems,
      externalReference: payload.externalReference,
      billingTypes: ["PIX", "CREDIT_CARD"],
    });

    return {
      checkout,
      checkoutUrl: checkout.checkoutUrl,
    };
  } catch (error) {
    console.warn("[asaas] Hosted checkout unavailable.", {
      error: error instanceof Error ? error.message : String(error),
      externalReference: payload.externalReference,
    });

    throw error;
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
