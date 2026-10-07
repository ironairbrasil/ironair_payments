import prisma from "../db.server.js";
import {
  getAsaasCustomer,
  getNormalizedAsaasPayment,
  isAsaasPaymentApproved,
} from "./asaas.server.js";
import { syncPaidOrderToBase } from "./base-order-sync.server.js";
import {
  baseFinancialPayload,
  baseOrderIssueDate,
  baseSalesOrderPayload,
  mappedProduct,
} from "./base-order-sync.server.js";
import { getBaseConfig } from "../config/base.server.js";
import { getBaseOrder, updateBaseOrder } from "./base.server.js";

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

export async function repairBaseOrderPaymentsForPaidOrder({ orderId, paymentId } = {}) {
  const order = await prisma.asaasShopifyOrder.findFirst({
    where: {
      ...retryOrderWhere({ orderId, paymentId }),
      status: "PAID",
    },
  });
  if (!order) return { success: false, error: "ORDER_NOT_FOUND" };
  if (!order.baseOrderId) return { success: false, error: "BASE_ORDER_NOT_FOUND" };

  const config = getBaseConfig();
  const payment = await getNormalizedAsaasPayment(order.asaasPaymentId);
  if (!isAsaasPaymentApproved(payment)) {
    return { success: false, error: "ASAAS_PAYMENT_NOT_APPROVED", asaasStatus: payment?.status };
  }

  const baseOrder = await getBaseOrder(order.baseOrderId);
  const product = mappedProduct(order.checkoutData, config.productMap);
  const financial = baseFinancialPayload(order, payment, product);
  const issueDate = baseOrderIssueDate(order, payment);
  const repairedPayload = baseSalesOrderPayload({
    issueDate,
    baseCustomerId: order.baseCustomerId || baseOrder.customerId,
    bankId: config.bankId,
    payment,
    financial,
  });

  const updated = await updateBaseOrder(order.baseOrderId, {
    ...repairedPayload,
    id: undefined,
    issueDate: baseOrder.issueDate || repairedPayload.issueDate,
    customerId: baseOrder.customerId || repairedPayload.customerId,
    externalReference: baseOrder.externalReference || repairedPayload.externalReference,
    observations: baseOrder.observations || repairedPayload.observations,
    typeOfShipping: baseOrder.typeOfShipping || repairedPayload.typeOfShipping,
    orderItems: Array.isArray(baseOrder.orderItems) && baseOrder.orderItems.length
      ? baseOrder.orderItems.map(({ productId, unitPrice, quantity }) => ({ productId, unitPrice, quantity }))
      : repairedPayload.orderItems,
    orderPayments: repairedPayload.orderPayments,
  });

  return {
    success: true,
    orderId: order.id,
    paymentId: order.asaasPaymentId,
    baseOrderId: order.baseOrderId,
    orderPayments: repairedPayload.orderPayments,
    updatedOrderValue: updated.orderValue,
  };
}
