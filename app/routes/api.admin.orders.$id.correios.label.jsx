import process from "node:process";
import { Buffer } from "node:buffer";

import { getAsaasConfig } from "../config/asaas.server";
import prisma from "../db.server";

function getBearerToken(request) {
  const authorization = request.headers.get("authorization");

  if (authorization?.toLowerCase().startsWith("bearer ")) {
    return authorization.slice("bearer ".length).trim();
  }

  return request.headers.get("x-admin-token") || request.headers.get("admin-token");
}

function isAuthorized(request) {
  const expectedToken =
    process.env.ADMIN_API_TOKEN || getAsaasConfig().webhookToken;

  return expectedToken
    ? getBearerToken(request) === expectedToken
    : process.env.NODE_ENV !== "production";
}

export async function loader({ request, params }) {
  if (!isAuthorized(request)) {
    return Response.json({ success: false, error: "Unauthorized." }, { status: 401 });
  }

  const id = Number(params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ success: false, error: "Invalid order id." }, { status: 400 });
  }

  const order = await prisma.asaasShopifyOrder.findUnique({ where: { id } });

  if (!order) {
    return Response.json({ success: false, error: "Order not found." }, { status: 404 });
  }

  if (order.correiosLabelUrl) {
    return Response.redirect(order.correiosLabelUrl, 302);
  }

  if (!order.correiosLabelBase64) {
    return Response.json(
      { success: false, error: "Correios label is not available." },
      { status: 404 },
    );
  }

  const label = Buffer.from(order.correiosLabelBase64, "base64");

  return new Response(label, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `inline; filename="correios-${order.shopifyOrderName || id}.pdf"`,
      "Content-Type": "application/pdf",
    },
  });
}
