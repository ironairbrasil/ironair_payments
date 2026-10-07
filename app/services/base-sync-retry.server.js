import prisma from "../db.server.js";
import {
  getAsaasCustomer,
  getNormalizedAsaasPayment,
  isAsaasPaymentApproved,
} from "./asaas.server.js";
import { syncPaidOrderToBase } from "./base-order-sync.server.js";

const DEFAULT_RETRY_LIMIT = 10;
const MAX_RETRY_LIMIT = 25;

function retryLimit(value) {
  const limit = Number(value || DEFAULT_RETRY_LIMIT);
  if (!Number.isInteger(limit) || limit <= 0) return DEFAULT_RETRY_LIMIT;
  return Math.min(limit, MAX_RETRY_LIMIT);
}

function retryOrderWhere({ orderId, paymentId } = {}) {
  if (orderId) return { id: Number(orderId) };
  if (paymentId) return { asaasPaymentId: String(paymentId) };
  return {
    status: "PAID",
    baseOrderId: null,
    baseSyncStatus: { in: ["PENDING", "FAILED"] },
  };
}

function safeOrderSummary(order) {
  return {
    orderId: order.id,
    paymentId: order.asaasPaymentId,
    shopifyOrderName: order.shopifyOrderName,
    status: order.status,
    baseOrderId: order.baseOrderId,
    baseSyncStatus: order.baseSyncStatus,
    baseSyncError: order.baseSyncError,
  };
}

export async function retryBaseSyncForPaidOrders({
  orderId,
  paymentId,
  limit,
  event = "BASE_RETRY_ADMIN",
} = {}) {
  const take = orderId || paymentId ? 1 : retryLimit(limit);
  const orders = await prisma.asaasShopifyOrder.findMany({
    where: retryOrderWhere({ orderId, paymentId }),
    orderBy: { id: "desc" },
    take,
  });

  const results = [];
  for (const order of orders) {
    if (order.status !== "PAID") {
      results.push({ ...safeOrderSummary(order), retryStatus: "SKIPPED_NOT_PAID" });
      continue;
    }
    if (order.baseOrderId) {
      results.push({ ...safeOrderSummary(order), retryStatus: "SKIPPED_ALREADY_SYNCED" });
      continue;
    }

    try {
      const payment = await getNormalizedAsaasPayment(order.asaasPaymentId);
      if (!isAsaasPaymentApproved(payment)) {
        results.push({
          ...safeOrderSummary(order),
          retryStatus: "SKIPPED_ASAAS_NOT_APPROVED",
          asaasStatus: payment?.status,
        });
        continue;
      }

      const customer = await getAsaasCustomer(payment.customer || order.asaasCustomerId);
      const syncResult = await syncPaidOrderToBase(order, {
        customer,
        payment,
        event,
        force: true,
      });
      results.push({
        ...safeOrderSummary(order),
        retryStatus: syncResult.status,
        baseOrderId: syncResult.baseOrderId ?? order.baseOrderId,
        error: syncResult.error,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await prisma.asaasShopifyOrder.update({
        where: { id: order.id },
        data: {
          baseSyncStatus: "FAILED",
          baseSyncError: message.slice(0, 1000),
          baseSyncEvent: event,
        },
      });
      results.push({
        ...safeOrderSummary(order),
        retryStatus: "FAILED",
        error: message,
      });
    }
  }

  return {
    success: true,
    count: results.length,
    results,
  };
}
