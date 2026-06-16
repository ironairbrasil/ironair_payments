import { getAsaasConfig } from "../config/asaas.server";
import { handleAsaasWebhook } from "../services/asaas.server";

function getWebhookHeaderToken(request) {
  const authorization = request.headers.get("authorization");

  if (authorization?.toLowerCase().startsWith("bearer ")) {
    return authorization.slice("bearer ".length).trim();
  }

  return (
    request.headers.get("asaas-access-token") ||
    request.headers.get("x-asaas-webhook-token") ||
    request.headers.get("asaas-webhook-token")
  );
}

function isWebhookTokenValid(request) {
  const { webhookToken } = getAsaasConfig();

  if (!webhookToken) {
    return true;
  }

  return getWebhookHeaderToken(request) === webhookToken;
}

export async function loader() {
  return Response.json({
    success: true,
    message: "Asaas webhook endpoint active",
    method: "POST",
    url: "/api/asaas/webhook",
  });
}

export async function action({ request }) {
  if (request.method !== "POST") {
    return Response.json(
      {
        success: false,
        error: "Method not allowed. Use POST.",
      },
      { status: 405 },
    );
  }

  if (!isWebhookTokenValid(request)) {
    return Response.json(
      {
        success: false,
        error: "Invalid webhook token.",
      },
      { status: 401 },
    );
  }

  let payload;

  try {
    payload = await request.json();
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: "Invalid JSON payload.",
      },
      { status: 400 },
    );
  }

  try {
    console.log(
      [
        "[ASAAS WEBHOOK]",
        `event=${payload.event}`,
        `payment=${payload.payment?.id}`,
        `value=${payload.payment?.value}`,
        `customer=${payload.payment?.customer}`,
        `externalReference=${payload.payment?.externalReference}`,
      ].join("\n"),
    );

    const result = await handleAsaasWebhook(payload);

    return Response.json({
      success: true,
      webhook: result,
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
