import process from "node:process";
import crypto from "node:crypto";

import { getAsaasConfig } from "../config/asaas.server";
import { handleAsaasWebhook } from "../services/asaas.server";
import prisma from "../db.server";

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
    return process.env.NODE_ENV !== "production";
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
  let persistedWebhookId;
  let webhookId;
  if (request.method !== "POST") {
    return Response.json(
      {
        success: false,
        error: "Method not allowed. Use POST.",
      },
      { status: 405 },
    );
  }

  if (process.env.NODE_ENV === "production" && !getAsaasConfig().webhookToken) {
    return Response.json(
      {
        success: false,
        error: "ASAAS_WEBHOOK_TOKEN is not configured.",
      },
      { status: 500 },
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

    const paymentId = payload.payment?.id || payload.data?.payment?.id || null;
    webhookId = String(
      payload.id ||
        payload.eventId ||
        crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex"),
    );
    persistedWebhookId = webhookId;
    try {
      await prisma.asaasWebhookEvent.create({
        data: {
          id: webhookId,
          event: String(payload.event || "UNKNOWN"),
          asaasPaymentId: paymentId,
          payload,
        },
      });
    } catch (error) {
      if (error?.code === "P2002") {
        return Response.json({ success: true, duplicate: true, webhookId });
      }
      throw error;
    }
  } catch (error) {
    if (persistedWebhookId) {
      await prisma.asaasWebhookEvent.update({
        where: { id: persistedWebhookId },
        data: {
          status: "FAILED",
          error: (error instanceof Error ? error.message : String(error)).slice(0, 1000),
          processedAt: new Date(),
        },
      }).catch(() => null);
    }
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
        `checkout=${payload.checkout?.id}`,
        `externalReference=${
          payload.payment?.externalReference || payload.checkout?.externalReference
        }`,
      ].join("\n"),
    );

    const result = await handleAsaasWebhook(payload);

    await prisma.asaasWebhookEvent.update({
      where: { id: webhookId },
      data: { status: "PROCESSED", processedAt: new Date() },
    });

    return Response.json({
      success: true,
      webhookId,
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
