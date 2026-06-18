import {
  CHECKOUT_CORS_HEADERS,
  checkoutJson,
} from "../services/checkout-flow.server";
import { createIronAirCheckout } from "../services/ironair-checkout.server";

function getClientIp(request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "127.0.0.1"
  );
}

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

  try {
    const checkout = await createIronAirCheckout(await request.json(), {
      remoteIp: getClientIp(request),
    });

    return checkoutJson({
      success: true,
      checkoutUrl: checkout.checkoutUrl,
      checkoutId: checkout.checkoutId,
      paymentId: checkout.paymentId,
      pix: checkout.pix,
      paymentMethod: checkout.paymentMethod,
      paymentStatus: checkout.paymentStatus,
      externalReference: checkout.externalReference,
      draftOrderId: checkout.draftOrderId,
      draftOrderName: checkout.draftOrderName,
      reused: checkout.reused,
    });
  } catch (error) {
    return checkoutJson(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 400 },
    );
  }
}
