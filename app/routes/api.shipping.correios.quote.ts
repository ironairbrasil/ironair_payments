import {
  CHECKOUT_CORS_HEADERS,
  checkoutJson,
} from "../services/checkout-flow.server";
import { quoteCorreiosShipping } from "../services/correios.server";

function shippingError(error: unknown, status = 400) {
  const message = error instanceof Error ? error.message : String(error);

  console.warn("[correios] Shipping quote failed.", {
    error: message,
  });

  return checkoutJson(
    {
      success: false,
      options: [],
      error: message,
    },
    { status },
  );
}

export async function loader({ request }: { request: Request }) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: CHECKOUT_CORS_HEADERS,
    });
  }

  return shippingError("Method not allowed. Use POST.", 405);
}

export async function action({ request }: { request: Request }) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: CHECKOUT_CORS_HEADERS,
    });
  }

  if (request.method !== "POST") {
    return shippingError("Method not allowed. Use POST.", 405);
  }

  let payload;

  try {
    payload = await request.json();
  } catch {
    return shippingError("Invalid JSON payload.");
  }

  try {
    return checkoutJson(await quoteCorreiosShipping(payload));
  } catch (error) {
    return shippingError(error);
  }
}
