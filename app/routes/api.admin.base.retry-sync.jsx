import process from "node:process";

import { isIncidentRecoveryAllowed } from "../services/http-safety.server";

function requireAdminToken(request) {
  const token =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    request.headers.get("x-admin-token") ||
    request.headers.get("admin-token");
  return Boolean(process.env.ADMIN_API_TOKEN && token === process.env.ADMIN_API_TOKEN);
}

export async function action({ request }) {
  if (!isIncidentRecoveryAllowed()) {
    return Response.json({ success: false, error: "Not found." }, { status: 404 });
  }
  if (!requireAdminToken(request)) {
    return Response.json({ success: false, error: "Unauthorized." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const {
    repairBaseOrderPaymentsForPaidOrder,
    retryBaseSyncForPaidOrders,
  } = await import("../services/base-sync-retry.server.js");
  if (body.action === "repair-payments") {
    const result = await repairBaseOrderPaymentsForPaidOrder({
      orderId: body.orderId,
      paymentId: body.paymentId,
    });
    return Response.json(result, { status: result.success ? 200 : 400 });
  }

  const result = await retryBaseSyncForPaidOrders({
    orderId: body.orderId,
    paymentId: body.paymentId,
    limit: body.limit,
    event: body.event || "BASE_RETRY_ADMIN",
  });

  return Response.json(result);
}
