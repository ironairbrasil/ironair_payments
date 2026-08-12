import {
  CHECKOUT_CORS_HEADERS,
  checkoutJson,
} from "../services/checkout-flow.server";
import { trackCorreiosObject } from "../services/correios.server";

function trackingError(error: unknown, status = 400) {
  const message = error instanceof Error ? error.message : String(error);

  console.warn("[correios] Tracking lookup failed.", { error: message });

  return checkoutJson(
    { success: false, error: message },
    { status },
  );
}

export async function loader({ request }: { request: Request }) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CHECKOUT_CORS_HEADERS });
  }

  const code = new URL(request.url).searchParams.get("code");

  if (!code) {
    return trackingError("Informe o código de rastreio.");
  }

  try {
    return checkoutJson(await trackCorreiosObject(code));
  } catch (error) {
    return trackingError(error);
  }
}
