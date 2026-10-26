import { checkoutJson } from "../services/http-safety.server";
import { sendMetaAddPaymentInfo } from "../services/meta-capi.server";

const EVENT_ID_PATTERN = /^ironair_api_[A-Za-z0-9_-]{8,100}$/;

function allowedSourceUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" &&
      (url.hostname === "ironair.com.br" || url.hostname.endsWith(".ironair.com.br"))
      ? url.toString().slice(0, 2000)
      : "https://pay.ironair.com.br/";
  } catch {
    return "https://pay.ironair.com.br/";
  }
}

export async function loader() {
  return checkoutJson({ success: false, error: "Method not allowed. Use POST." }, { status: 405 });
}

export async function action({ request }) {
  if (request.method !== "POST") {
    return checkoutJson({ success: false, error: "Method not allowed. Use POST." }, { status: 405 });
  }

  try {
    const body = await request.json();
    const value = Number(body?.value);
    if (!EVENT_ID_PATTERN.test(String(body?.eventId || "")) ||
        !Number.isFinite(value) || value < 0 || value > 1_000_000) {
      return checkoutJson({ success: false, error: "Invalid event." }, { status: 400 });
    }

    const result = await sendMetaAddPaymentInfo({
      eventId: body.eventId,
      value,
      contentIds: Array.isArray(body.contentIds) ? body.contentIds : [],
      paymentMethod: String(body.paymentMethod || "").slice(0, 30),
      externalReference: String(body.externalReference || "").slice(0, 200),
      customer: body.customer || {},
      shippingAddress: body.shippingAddress || {},
      sourceUrl: allowedSourceUrl(body.sourceUrl),
      fbp: String(body.fbp || "").slice(0, 500) || undefined,
      fbc: String(body.fbc || "").slice(0, 500) || undefined,
      clientIp: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        request.headers.get("x-real-ip") || "",
      userAgent: request.headers.get("user-agent") || "",
    });
    const delivered = result.success === true;
    return checkoutJson({ success: delivered, delivered }, { status: delivered ? 200 : 503 });
  } catch {
    return checkoutJson({ success: false, error: "Invalid request." }, { status: 400 });
  }
}
