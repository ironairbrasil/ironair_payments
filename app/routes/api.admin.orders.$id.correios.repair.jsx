import process from "node:process";

import { getAsaasConfig } from "../config/asaas.server";
import prisma from "../db.server";
import {
  cancelPrePostage,
  getPrePostageByTrackingCode,
} from "../services/correios.server";
import { createCorreiosPrePostageForOrder } from "../services/correios-order.server";

const REPAIRABLE_ORDER_IDS = new Set([38, 40]);
const CANCELLABLE_STATUSES = new Set([
  "PREATENDIDO",
  "PREPOSTADO",
  "PREPOSTED",
  "PENDENTE",
]);
const CANCELLED_STATUSES = new Set(["CANCELADO", "CANCELLED"]);
const QUERY_STATUSES = [
  "POSTADO",
  "PREPOSTADO",
  "PREATENDIDO",
  "PENDENTE",
  "CANCELADO",
  "EXPIRADO",
  "ESTORNADO",
];

function getBearerToken(request) {
  const authorization = request.headers.get("authorization");
  return authorization?.toLowerCase().startsWith("bearer ")
    ? authorization.slice("bearer ".length).trim()
    : request.headers.get("x-admin-token");
}

function isAuthorized(request) {
  const expected = process.env.ADMIN_API_TOKEN || getAsaasConfig().webhookToken;
  return Boolean(expected && getBearerToken(request) === expected);
}

function normalizedStatus(result) {
  return String(result?.status || "").trim().toUpperCase();
}

function getStatusDetails(value, trackingCode) {
  if (!value || typeof value !== "object") return null;
  if (
    !Array.isArray(value) &&
    String(value.codigoObjeto || value.codigoRastreio || "") === trackingCode
  ) {
    return Object.fromEntries(
      Object.entries(value).filter(
        ([key, item]) =>
          /status|situacao|dataHoraStatus/i.test(key) &&
          ["string", "number", "boolean"].includes(typeof item),
      ),
    );
  }
  for (const item of Array.isArray(value) ? value : Object.values(value)) {
    const found = getStatusDetails(item, trackingCode);
    if (found) return found;
  }
  return null;
}

async function getConfirmedCorreiosStatus(trackingCode) {
  for (const status of QUERY_STATUSES) {
    try {
      return await getPrePostageByTrackingCode(trackingCode, status);
    } catch (error) {
      if (!String(error instanceof Error ? error.message : error).includes(
        "did not return the requested tracking code",
      )) {
        throw error;
      }
    }
  }

  throw new Error("Correios did not return the tracking code in any known status.");
}

async function loadOrder(params) {
  const id = Number(params.id);
  if (!REPAIRABLE_ORDER_IDS.has(id)) {
    throw new Error("This recovery endpoint is restricted to orders 38 and 40.");
  }

  const order = await prisma.asaasShopifyOrder.findUnique({ where: { id } });
  if (!order?.correiosPrePostageId) {
    throw new Error("Order does not have an active Correios pre-postage id.");
  }
  return order;
}

export async function loader({ request, params }) {
  if (!isAuthorized(request)) {
    return Response.json({ success: false, error: "Unauthorized." }, { status: 401 });
  }

  try {
    const order = await loadOrder(params);
    const correios = await getConfirmedCorreiosStatus(order.correiosTrackingCode);
    return Response.json({
      success: true,
      orderId: order.id,
      shopifyOrder: order.shopifyOrderName,
      prePostageId: order.correiosPrePostageId,
      trackingCode: order.correiosTrackingCode,
      status: normalizedStatus(correios),
      statusDetails: getStatusDetails(
        correios.raw,
        order.correiosTrackingCode,
      ),
      cancellable: CANCELLABLE_STATUSES.has(normalizedStatus(correios)),
    });
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }
}

export async function action({ request, params }) {
  if (request.method !== "POST") {
    return Response.json({ success: false, error: "Method not allowed." }, { status: 405 });
  }
  if (!isAuthorized(request)) {
    return Response.json({ success: false, error: "Unauthorized." }, { status: 401 });
  }

  try {
    const order = await loadOrder(params);
    const before = await getConfirmedCorreiosStatus(order.correiosTrackingCode);
    const beforeStatus = normalizedStatus(before);

    if (!CANCELLABLE_STATUSES.has(beforeStatus)) {
      return Response.json({
        success: true,
        skipped: true,
        reason: "Current Correios status is not cancellable.",
        orderId: order.id,
        trackingCode: order.correiosTrackingCode,
        status: beforeStatus,
      });
    }

    await cancelPrePostage(order.correiosPrePostageId);
    const cancellationConfirmation = await getPrePostageByTrackingCode(
      order.correiosTrackingCode,
      "CANCELADO",
    );
    const cancellationStatus = normalizedStatus(cancellationConfirmation);
    if (!CANCELLED_STATUSES.has(cancellationStatus)) {
      throw new Error(
        `Correios did not confirm cancellation (status: ${cancellationStatus || "empty"}).`,
      );
    }

    await prisma.asaasShopifyOrder.update({
      where: { id: order.id },
      data: {
        shippingStatus: "AWAITING_LABEL",
        correiosPrePostageId: null,
        correiosReceiptId: null,
        correiosTrackingCode: null,
        correiosStatus: cancellationStatus,
        correiosLabelUrl: null,
        correiosLabelBase64: null,
        correiosPrePostedAt: null,
        correiosLabelGeneratedAt: null,
        correiosError: null,
      },
    });

    const replacement = await createCorreiosPrePostageForOrder(order.id);
    return Response.json({
      ...replacement,
      cancelledPrePostageId: order.correiosPrePostageId,
      cancelledTrackingCode: order.correiosTrackingCode,
      cancellationStatus,
    });
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }
}
