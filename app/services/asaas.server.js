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
const ASAAS_ITEM_NAME = "Iron Air";
const MAX_ASAAS_DESCRIPTION_LENGTH = 500;

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

function truncateAsaasText(value, maxLength) {
  const text = String(value || "").trim();

  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function todayAsIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function maskValue(value) {
  const text = String(value || "");

  if (text.includes("@")) {
    const [user, domain] = text.split("@");
    return `${user.slice(0, 2)}***@${domain}`;
  }

  return text.length > 4 ? `${text.slice(0, 3)}***${text.slice(-2)}` : "***";
}

function sanitizePayloadForLog(value) {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizePayloadForLog(item));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      ["email", "cpfCnpj", "phone", "mobilePhone"].includes(key)
        ? maskValue(item)
        : sanitizePayloadForLog(item),
    ]),
  );
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
  customerData,
  billingTypes = ["PIX", "CREDIT_CARD"],
}) {
  const checkoutPayload = {
    billingTypes,
    chargeTypes: ["DETACHED"],
    minutesToExpire: 1440,
    externalReference,
    callback: getCheckoutCallbackUrls(),
    items,
    ...(customerData ? { customerData } : {}),
  };

  console.log(
    "[asaas] Creating hosted checkout.",
    sanitizePayloadForLog(checkoutPayload),
  );

  const checkout = await requestAsaas("/checkouts", {
    method: "POST",
    body: JSON.stringify(checkoutPayload),
  });

  return {
    ...checkout,
    checkoutUrl: getCheckoutUrl(checkout),
  };
}

async function createAsaasCustomerForCustomCheckout({ customer, shippingAddress }) {
  const customerPayload = {
    name: customer.name,
    email: customer.email,
    cpfCnpj: customer.cpfCnpj,
    mobilePhone: customer.phone,
    phone: customer.phone,
    address: shippingAddress?.address1,
    addressNumber: shippingAddress?.number,
    complement: shippingAddress?.complement,
    province: shippingAddress?.neighborhood,
    postalCode: shippingAddress?.postalCode,
    city: shippingAddress?.city,
    state: shippingAddress?.provinceCode,
  };

  console.log(
    "[asaas] Creating customer for custom checkout.",
    sanitizePayloadForLog(customerPayload),
  );

  return requestAsaas("/customers", {
    method: "POST",
    body: JSON.stringify(customerPayload),
  });
}

export async function getAsaasPixQrCode(paymentId) {
  if (!paymentId) {
    return null;
  }

  return requestAsaas(`/payments/${paymentId}/pixQrCode`);
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
      name: ASAAS_ITEM_NAME,
      description: truncateAsaasText(
        [
          item.productHandle ? `Produto: ${item.productHandle}` : null,
          item.variantGid || item.variantId
            ? `Variante: ${item.variantGid || item.variantId}`
            : null,
        ]
          .filter(Boolean)
          .join(" | ") || getAsaasDescription(),
        MAX_ASAAS_DESCRIPTION_LENGTH,
      ),
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

export async function createAsaasCheckoutForCustomCheckout({
  customer,
  shippingAddress,
  externalReference,
  items,
}) {
  const checkoutItems = items.map((item) => ({
    name: ASAAS_ITEM_NAME,
    description: truncateAsaasText(
      item.title || item.productHandle || getAsaasDescription(),
      MAX_ASAAS_DESCRIPTION_LENGTH,
    ),
    quantity: Math.max(1, Number(item.quantity) || 1),
    value: Number(item.price),
  }));

  const customerData = {
    name: customer.name,
    email: customer.email,
    cpfCnpj: customer.cpfCnpj,
    mobilePhone: customer.phone,
    phone: customer.phone,
    address: shippingAddress?.address1,
    addressNumber: shippingAddress?.number,
    complement: shippingAddress?.complement,
    province: shippingAddress?.neighborhood,
    postalCode: shippingAddress?.postalCode,
    city: shippingAddress?.city,
    cityName: shippingAddress?.city,
    state: shippingAddress?.provinceCode,
  };

  try {
    const checkout = await createAsaasCheckout({
      items: checkoutItems,
      externalReference,
      customerData,
      billingTypes: ["PIX", "CREDIT_CARD", "BOLETO"],
    });

    return {
      checkout,
      checkoutUrl: checkout.checkoutUrl,
    };
  } catch (error) {
    console.warn("[asaas] Custom checkout with boleto unavailable, retrying.", {
      error: error instanceof Error ? error.message : String(error),
      externalReference,
    });
  }

  const checkout = await createAsaasCheckout({
    items: checkoutItems,
    externalReference,
    customerData,
    billingTypes: ["PIX", "CREDIT_CARD"],
  });

  return {
    checkout,
    checkoutUrl: checkout.checkoutUrl,
  };
}

export async function createAsaasPixPaymentForCustomCheckout({
  customer,
  shippingAddress,
  externalReference,
  items,
  value,
}) {
  const asaasCustomer = await createAsaasCustomerForCustomCheckout({
    customer,
    shippingAddress,
  });
  const description = truncateAsaasText(
    items
      .map((item) => `${Math.max(1, Number(item.quantity) || 1)}x ${item.title}`)
      .join(" | ") || getAsaasDescription(),
    MAX_ASAAS_DESCRIPTION_LENGTH,
  );
  const paymentPayload = {
    customer: asaasCustomer.id,
    billingType: "PIX",
    value: Number(value),
    dueDate: todayAsIsoDate(),
    description,
    externalReference,
  };

  console.log(
    "[asaas] Creating direct Pix payment.",
    sanitizePayloadForLog(paymentPayload),
  );

  const payment = await requestAsaas("/payments", {
    method: "POST",
    body: JSON.stringify(paymentPayload),
  });
  const pix = await getAsaasPixQrCode(payment.id);

  return {
    payment,
    pix,
    asaasCustomer,
  };
}

export async function getAsaasCustomer(customerId) {
  if (!customerId) {
    return null;
  }

  return requestAsaas(`/customers/${customerId}`);
}

export async function getAsaasPayment(paymentId) {
  if (!paymentId) {
    return null;
  }

  return requestAsaas(`/payments/${paymentId}`);
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

  console.log("[asaas] Raw webhook payload received.", payload);
  console.log("[asaas] Webhook IDs received.", {
    event,
    paymentId: payment?.id,
    paymentCustomer: payment?.customer,
    checkoutId: checkout?.id,
    checkoutCustomer: checkout?.customer,
    status: payment?.status ?? checkout?.status,
    value: payment?.value,
    externalReference: payment?.externalReference ?? checkout?.externalReference,
  });

  if (APPROVED_PAYMENT_EVENTS.has(event)) {
    const paymentId = payment?.id;
    const asaasPayment =
      paymentId && !payment?.externalReference
        ? await getAsaasPayment(paymentId)
        : payment;
    const asaasCustomerId =
      asaasPayment?.customer ?? payment?.customer ?? checkout?.customer;
    const resolvedExternalReference =
      asaasPayment?.externalReference ??
      payment?.externalReference ??
      checkout?.externalReference;

    console.log("[asaas] GET /payments/{id} response.", {
      paymentId,
      response: sanitizePayloadForLog(asaasPayment),
    });

    console.log("[asaas] Approved payment webhook:", {
      paymentId,
      checkoutId: checkout?.id,
      status: asaasPayment?.status ?? payment?.status ?? checkout?.status,
      value: asaasPayment?.value ?? payment?.value,
      customer: asaasCustomerId,
      billingType: asaasPayment?.billingType ?? payment?.billingType,
      externalReference: resolvedExternalReference,
    });

    console.log("[SHOPIFY ORDER READY]");
    await completeDraftOrderForAsaasPayment(paymentId, {
      asaasCheckoutId: checkout?.id,
      asaasCustomerId,
      asaasPayment,
      externalReference: resolvedExternalReference,
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
