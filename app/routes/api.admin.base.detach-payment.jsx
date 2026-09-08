import process from "node:process";

import { isIncidentRecoveryAllowed } from "../services/http-safety.server";

const PAYMENT_ID = "pay_zahe74atfgzecyal";

export async function action({ request }) {
  if (!isIncidentRecoveryAllowed()) {
    return Response.json({ success: false, error: "Not found." }, { status: 404 });
  }
  const [{ default: prisma }, { getBaseConfig }, { getBaseOrder, updateBaseOrder }] = await Promise.all([
    import("../db.server"),
    import("../config/base.server"),
    import("../services/base.server"),
  ]);
  if (!process.env.ADMIN_API_TOKEN || request.headers.get("authorization") !== `Bearer ${process.env.ADMIN_API_TOKEN}`) {
    return Response.json({ success: false }, { status: 401 });
  }
  const { paymentId } = await request.json();
  if (paymentId !== PAYMENT_ID) return Response.json({ success: false }, { status: 403 });
  const mapped = await prisma.asaasShopifyOrder.findUnique({ where: { asaasPaymentId: paymentId } });
  if (!mapped?.baseOrderId) return Response.json({ success: false, error: "BASE_ORDER_NOT_FOUND" }, { status: 404 });
  const order = await getBaseOrder(mapped.baseOrderId);
  const config = getBaseConfig();
  const updated = await updateBaseOrder(mapped.baseOrderId, {
    issueDate: order.issueDate,
    customerId: order.customerId,
    externalReference: order.externalReference,
    observations: order.observations,
    typeOfShipping: order.typeOfShipping || "SEM_FRETE",
    orderItems: order.orderItems.map(({ productId, unitPrice, quantity }) => ({ productId, unitPrice, quantity })),
    orderPayments: [{
      dueDate: order.issueDate,
      value: Number(mapped.value),
      bankId: config.bankId,
      billingType: "PIX",
    }],
  });
  return Response.json({ success: true, baseOrderId: mapped.baseOrderId, orderValue: updated.orderValue });
}
