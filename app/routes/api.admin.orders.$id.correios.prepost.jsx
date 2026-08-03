import process from "node:process";

import { getAsaasConfig } from "../config/asaas.server";
import { createCorreiosPrePostageForOrder } from "../services/correios-order.server";

function getBearerToken(request) {
  const authorization = request.headers.get("authorization");

  if (authorization?.toLowerCase().startsWith("bearer ")) {
    return authorization.slice("bearer ".length).trim();
  }

  return (
    request.headers.get("x-admin-token") ||
    request.headers.get("admin-token") ||
    request.headers.get("asaas-access-token")
  );
}

function getExpectedAdminToken() {
  return process.env.ADMIN_API_TOKEN || getAsaasConfig().webhookToken;
}

function isAdminRequestAuthorized(request) {
  const expectedToken = getExpectedAdminToken();

  if (!expectedToken) {
    return process.env.NODE_ENV !== "production";
  }

  return getBearerToken(request) === expectedToken;
}

export async function loader() {
  return Response.json({
    success: true,
    message: "Correios manual pre-postage endpoint active.",
    method: "POST",
  });
}

export async function action({ request, params }) {
  if (request.method !== "POST") {
    return Response.json(
      {
        success: false,
        error: "Method not allowed. Use POST.",
      },
      { status: 405 },
    );
  }

  if (!isAdminRequestAuthorized(request)) {
    return Response.json(
      {
        success: false,
        error: "Unauthorized.",
      },
      { status: 401 },
    );
  }

  try {
    const result = await createCorreiosPrePostageForOrder(params.id);

    return Response.json(result, {
      status: result.success ? 200 : 502,
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 400 },
    );
  }
}
