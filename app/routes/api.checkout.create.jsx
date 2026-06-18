import {
  CHECKOUT_CORS_HEADERS,
  checkoutJson,
  normalizeRealCheckoutPayload,
  startCheckoutFlow,
} from "../services/checkout-flow.server";

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

  let payload;

  try {
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
    const checkout = await startCheckoutFlow(payload);
    const paymentUrl = checkout.checkoutUrl;

    return checkoutJson({
      ...checkout,
      success: true,
      paymentUrl,
      checkoutUrl: paymentUrl,
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
