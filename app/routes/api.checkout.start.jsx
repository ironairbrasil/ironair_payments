import {
  CHECKOUT_CORS_HEADERS,
  checkoutJson,
} from "../services/http-safety.server";
import { isLegacyCheckoutAllowed } from "../services/payment-integrity.server";

export async function loader({ request }) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: CHECKOUT_CORS_HEADERS,
    });
  }

  return checkoutJson(
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
      headers: CHECKOUT_CORS_HEADERS,
    });
  }

  if (request.method !== "POST") {
    return checkoutJson(
      {
        success: false,
        error: "Method not allowed. Use POST.",
      },
      { status: 405 },
    );
  }

  if (!isLegacyCheckoutAllowed()) {
    return checkoutJson({ success: false, error: "Not found." }, { status: 404 });
  }

  let payload;

  try {
    const { normalizeRealCheckoutPayload } = await import("../services/checkout-flow.server");
    payload = normalizeRealCheckoutPayload(await request.json());
  } catch (error) {
    return checkoutJson(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 400 },
    );
  }

  try {
    const { startCheckoutFlow } = await import("../services/checkout-flow.server");
    const checkout = await startCheckoutFlow(payload);

    return checkoutJson({
      checkoutUrl: checkout.checkoutUrl,
    });
  } catch (error) {
    return checkoutJson(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
