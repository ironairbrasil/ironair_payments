import {
  CHECKOUT_CORS_HEADERS,
  checkoutJson,
} from "../services/checkout-flow.server";
import { createIronAirCheckout } from "../services/ironair-checkout.server";

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
    const checkout = await createIronAirCheckout(await request.json());

    return checkoutJson({
      success: true,
      checkoutUrl: checkout.checkoutUrl,
      checkoutId: checkout.checkoutId,
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
