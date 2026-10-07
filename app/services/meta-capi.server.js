import crypto from "node:crypto";

const META_GRAPH_VERSION = "v21.0";
const HASHED_USER_FIELDS = ["em", "ph", "fn", "ln", "ct", "st", "zp", "country", "external_id"];
const TRANSIENT_META_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);
const META_PURCHASE_PROCESSING_STALE_MS = 30 * 60 * 1000;
const META_PURCHASE_MAX_ATTEMPTS = 6;
const META_CAPI_TIMEOUT_MS = 8000;

function getMetaConfig(env = process.env) {
  return {
    pixelId: env.META_PIXEL_ID || env.PUBLIC_META_PIXEL_ID || "",
    accessToken: env.META_ACCESS_TOKEN || "",
    testEventCode: env.META_TEST_EVENT_CODE || "",
  };
}

function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeName(value) {
  return normalizeText(value)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCity(value) {
  return normalizeName(value).replace(/\s+/g, "");
}

function normalizeEmail(value) {
  return normalizeText(value);
}

function normalizePhone(value) {
  const digits = onlyDigits(value);
  if (!digits) return "";
  return digits.startsWith("55") ? digits : `55${digits}`;
}

function sha256(value) {
  const normalized = String(value || "");
  if (!normalized) return "";
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

function splitName(name) {
  const parts = normalizeName(name).split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: parts[0] };
  return { firstName: parts[0], lastName: parts.at(-1) };
}

function numericVariantId(value) {
  return String(value || "").replace(/\D/g, "");
}

function cleanObject(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined && item !== null && item !== ""),
  );
}

function safeCheckoutData(order = {}) {
  return order.checkoutData && typeof order.checkoutData === "object"
    ? order.checkoutData
    : {};
}

function safeAttribution(order = {}) {
  return order.attribution && typeof order.attribution === "object"
    ? order.attribution
    : {};
}

export function buildMetaPurchaseEventId(order = {}) {
  if (!order.id) {
    throw new Error("META_PURCHASE_ORDER_ID_REQUIRED");
  }
  return `ironair_purchase_${order.id}`;
}

export function buildMetaPurchaseUserData(order = {}) {
  const checkoutData = safeCheckoutData(order);
  const attribution = safeAttribution(order);
  const customer = checkoutData.customer || {};
  const shippingAddress = checkoutData.shippingAddress || {};
  const tracking = checkoutData.tracking || {};
  const { firstName, lastName } = splitName(customer.name);
  const userData = {
    em: sha256(normalizeEmail(customer.email)),
    ph: sha256(normalizePhone(customer.phone)),
    fn: sha256(firstName),
    ln: sha256(lastName),
    ct: sha256(normalizeCity(shippingAddress.city)),
    st: sha256(normalizeText(shippingAddress.provinceCode)),
    zp: sha256(onlyDigits(shippingAddress.postalCode)),
    country: sha256("br"),
    external_id: sha256(String(order.externalReference || order.id || "")),
    client_ip_address: tracking.clientIp || undefined,
    client_user_agent: tracking.userAgent || undefined,
    fbp: attribution._fbp || undefined,
    fbc: attribution._fbc || undefined,
  };

  return cleanObject(userData);
}

export function buildMetaPurchaseCustomData(order = {}) {
  const checkoutData = safeCheckoutData(order);
  const items = Array.isArray(checkoutData.items) ? checkoutData.items : [];
  const contents = items.map((item) => {
    const id = item.sku || numericVariantId(item.variantId) || item.variantId || item.title || "iron-air";
    return cleanObject({
      id: String(id),
      quantity: Math.max(1, Number(item.quantity) || 1),
      item_price: Number.isFinite(Number(item.price)) ? Number(item.price) : undefined,
    });
  });
  const contentIds = contents.map((item) => item.id).filter(Boolean);
  const numItems = contents.reduce((total, item) => total + (Number(item.quantity) || 0), 0);

  return cleanObject({
    currency: "BRL",
    value: Number(order.value),
    order_id: order.shopifyOrderId || order.asaasPaymentId || order.externalReference,
    content_ids: contentIds,
    contents,
    content_type: "product",
    num_items: numItems || undefined,
  });
}

export function buildMetaPurchasePayload(order = {}, { eventId, eventTime } = {}) {
  const resolvedEventId = eventId || order.metaPurchaseEventId || buildMetaPurchaseEventId(order);
  return {
    data: [
      {
        event_name: "Purchase",
        event_time: eventTime || Math.floor(Date.now() / 1000),
        event_id: resolvedEventId,
        action_source: "website",
        event_source_url: "https://pay.ironair.com.br/checkout/success",
        user_data: buildMetaPurchaseUserData(order),
        custom_data: buildMetaPurchaseCustomData(order),
      },
    ],
  };
}

function summarizeMetaResponse(status, body) {
  const error = typeof body === "object" && body ? body.error || body : {};
  const message = typeof error.message === "string"
    ? sanitizeOperationalText(error.message)
    : undefined;

  return cleanObject({
    status,
    errorCode: error.code !== undefined ? String(error.code) : undefined,
    errorSubcode: error.error_subcode !== undefined ? String(error.error_subcode) : undefined,
    errorType: typeof error.type === "string" ? sanitizeOperationalText(error.type) : undefined,
    message,
    fbtraceId: typeof error.fbtrace_id === "string" ? error.fbtrace_id.slice(0, 200) : undefined,
    eventsReceived: body?.events_received,
    messages: Array.isArray(body?.messages)
      ? body.messages.slice(0, 5).map((item) => sanitizeOperationalText(JSON.stringify(item)))
      : undefined,
  });
}

function metaLogContext(order, eventId, extra = {}) {
  return {
    orderId: order.id,
    paymentId: order.asaasPaymentId,
    externalReference: order.externalReference,
    eventId,
    ...extra,
  };
}

function sanitizeOperationalText(value) {
  return String(value || "")
    .replace(/access_token=[^&\s]+/gi, "access_token=[redacted]")
    .replace(/EA[A-Za-z0-9_-]{20,}/g, "[redacted-token]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .replace(/\b(?:\+?55)?\d{10,13}\b/g, "[redacted-phone]")
    .slice(0, 500);
}

function staleProcessingCutoff(nowDate) {
  return new Date(nowDate.getTime() - META_PURCHASE_PROCESSING_STALE_MS);
}

function isAbortError(error) {
  return error?.name === "AbortError";
}

async function resolvePrisma(prismaClient) {
  if (prismaClient) return prismaClient;
  return (await import("../db.server")).default;
}

export async function ensureMetaPurchaseEventId(order, { prismaClient } = {}) {
  const db = await resolvePrisma(prismaClient);
  if (!order?.id) return null;
  if (order.metaPurchaseEventId) return order.metaPurchaseEventId;

  const eventId = buildMetaPurchaseEventId(order);
  await db.asaasShopifyOrder.updateMany({
    where: { id: order.id, metaPurchaseEventId: null },
    data: { metaPurchaseEventId: eventId },
  });
  return eventId;
}

export async function sendMetaPurchaseForPaidOrder(orderId, {
  prismaClient,
  fetchImpl = fetch,
  env = process.env,
  now = () => new Date(),
} = {}) {
  const db = await resolvePrisma(prismaClient);
  const order = await db.asaasShopifyOrder.findUnique({ where: { id: orderId } });
  if (!order) return { skipped: true, reason: "ORDER_NOT_FOUND" };
  if (order.status !== "PAID") return { skipped: true, reason: "ORDER_NOT_PAID" };
  if (order.metaPurchaseStatus === "SENT") {
    return { skipped: true, reason: "ALREADY_SENT", eventId: order.metaPurchaseEventId };
  }
  if (order.metaPurchaseStatus === "LEGACY_SKIPPED") {
    return { skipped: true, reason: "LEGACY_SKIPPED", eventId: order.metaPurchaseEventId };
  }
  if (Number(order.metaPurchaseAttempts || 0) >= META_PURCHASE_MAX_ATTEMPTS) {
    return { skipped: true, reason: "MAX_ATTEMPTS", eventId: order.metaPurchaseEventId };
  }

  const eventId = await ensureMetaPurchaseEventId(order, { prismaClient: db });
  const attemptedAt = now();
  const staleBefore = staleProcessingCutoff(attemptedAt);
  const claim = await db.asaasShopifyOrder.updateMany({
    where: {
      id: order.id,
      status: "PAID",
      metaPurchaseAttempts: { lt: META_PURCHASE_MAX_ATTEMPTS },
      OR: [
        { metaPurchaseStatus: null },
        { metaPurchaseStatus: "FAILED" },
        { metaPurchaseStatus: "PROCESSING", metaPurchaseAttemptedAt: { lt: staleBefore } },
      ],
    },
    data: {
      metaPurchaseEventId: eventId,
      metaPurchaseStatus: "PROCESSING",
      metaPurchaseLastError: null,
      metaPurchaseAttemptedAt: attemptedAt,
      metaPurchaseAttempts: { increment: 1 },
    },
  });

  if (claim.count !== 1) {
    const current = await db.asaasShopifyOrder.findUnique({ where: { id: order.id } });
    const maxAttemptsReached = Number(current?.metaPurchaseAttempts || 0) >= META_PURCHASE_MAX_ATTEMPTS;
    return {
      skipped: true,
      reason:
        current?.metaPurchaseStatus === "SENT"
          ? "ALREADY_SENT"
          : current?.metaPurchaseStatus === "LEGACY_SKIPPED"
            ? "LEGACY_SKIPPED"
            : maxAttemptsReached
              ? "MAX_ATTEMPTS"
              : "IN_PROGRESS",
      eventId,
    };
  }

  const config = getMetaConfig(env);
  if (!config.pixelId || !config.accessToken) {
    const error = "META_CAPI_NOT_CONFIGURED";
    await db.asaasShopifyOrder.update({
      where: { id: order.id },
      data: {
        metaPurchaseStatus: "FAILED",
        metaPurchaseLastError: error,
        metaPurchaseLastResponse: null,
      },
    });
    console.warn("[meta capi] Purchase not sent; missing configuration.", metaLogContext(order, eventId));
    return { success: false, retryable: true, eventId, error };
  }

  const latestOrder = await db.asaasShopifyOrder.findUnique({ where: { id: order.id } });
  const payload = buildMetaPurchasePayload(latestOrder || order, {
    eventId,
    eventTime: Math.floor(attemptedAt.getTime() / 1000),
  });
  if (config.testEventCode) {
    payload.test_event_code = config.testEventCode;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), META_CAPI_TIMEOUT_MS);
    const url = `https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(
      config.pixelId,
    )}/events?access_token=${encodeURIComponent(config.accessToken)}`;
    let response;
    try {
      response = await fetchImpl(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
    const contentType = response.headers?.get?.("content-type") || "";
    const body = contentType.includes("application/json")
      ? await response.json()
      : await response.text();
    const responseSummary = summarizeMetaResponse(response.status, body);

    if (!response.ok) {
      const retryable = TRANSIENT_META_STATUS_CODES.has(response.status);
      await db.asaasShopifyOrder.update({
        where: { id: order.id },
        data: {
          metaPurchaseStatus: "FAILED",
          metaPurchaseLastError: `META_CAPI_HTTP_${response.status}`,
          metaPurchaseLastResponse: responseSummary,
        },
      });
      console.warn("[meta capi] Purchase failed.", metaLogContext(order, eventId, {
        status: response.status,
        retryable,
      }));
      return {
        success: false,
        retryable,
        eventId,
        error: `META_CAPI_HTTP_${response.status}`,
      };
    }

    await db.asaasShopifyOrder.update({
      where: { id: order.id },
      data: {
        metaPurchaseStatus: "SENT",
        metaPurchaseLastError: null,
        metaPurchaseLastResponse: responseSummary,
        metaPurchaseSentAt: now(),
      },
    });
    console.log("[meta capi] Purchase sent.", metaLogContext(order, eventId, {
      status: response.status,
    }));
    return { success: true, eventId, response: responseSummary };
  } catch (error) {
    const message = isAbortError(error)
      ? `META_CAPI_TIMEOUT_${META_CAPI_TIMEOUT_MS}MS`
      : sanitizeOperationalText(error instanceof Error ? error.message : String(error));
    await db.asaasShopifyOrder.update({
      where: { id: order.id },
      data: {
        metaPurchaseStatus: "FAILED",
        metaPurchaseLastError: message.slice(0, 1000),
        metaPurchaseLastResponse: null,
      },
    });
    console.warn("[meta capi] Purchase request failed.", metaLogContext(order, eventId, {
      error: message,
    }));
    return { success: false, retryable: true, eventId, error: message };
  }
}

export const META_HASHED_USER_FIELDS = HASHED_USER_FIELDS;
export const META_PURCHASE_STALE_MINUTES = META_PURCHASE_PROCESSING_STALE_MS / 60000;
export const META_PURCHASE_MAX_RETRY_ATTEMPTS = META_PURCHASE_MAX_ATTEMPTS;
export const META_CAPI_TIMEOUT_MILLISECONDS = META_CAPI_TIMEOUT_MS;
