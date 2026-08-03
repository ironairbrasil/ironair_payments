import prisma from "../db.server";
import {
  createPrePostage,
  generatePrePostageLabel,
} from "./correios.server";
import { mergeCorreiosResults } from "./correios-response.server";
import {
  createShopifyFulfillmentWithTracking,
  updateShopifyOrderCorreiosMetadata,
} from "./shopify-order.server";

const SHIPPING_STATUS = {
  AWAITING_LABEL: "AWAITING_LABEL",
  CREATING_LABEL: "CREATING_LABEL",
  PREPOSTED: "PREPOSTED",
  ERROR: "ERROR",
};

function maskValue(value) {
  const text = String(value || "");

  if (text.includes("@")) {
    const [user, domain] = text.split("@");
    return `${user.slice(0, 2)}***@${domain}`;
  }

  return text.length > 4 ? `${text.slice(0, 3)}***${text.slice(-2)}` : "***";
}

function sanitizeForLog(value) {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForLog(item));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      ["email", "cpfCnpj", "phone", "mobilePhone"].includes(key)
        ? maskValue(item)
        : sanitizeForLog(item),
    ]),
  );
}

function normalizeAsaasAddress(customer = {}, mappedOrder = {}) {
  return {
    postalCode:
      customer.postalCode || mappedOrder.shippingDestinationCep || "",
    address1: customer.address || "",
    number: customer.addressNumber || "S/N",
    complement: customer.complement || "",
    neighborhood: customer.province || customer.neighborhood || "Centro",
    city: customer.cityName || customer.city || "",
    provinceCode: customer.state || "",
  };
}

function buildCustomerForPrePostage(customer = {}, mappedOrder = {}) {
  return {
    name: customer.name,
    cpfCnpj: customer.cpfCnpj,
    phone: customer.mobilePhone || customer.phone,
    email: customer.email,
    address: normalizeAsaasAddress(customer, mappedOrder),
  };
}

function truncateError(error) {
  return String(error instanceof Error ? error.message : error).slice(0, 5000);
}

function asJsonValue(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function isEligibleForCorreiosPrePostage(order) {
  return Boolean(
    order?.status === "PAID" &&
      order.shopifyOrderId &&
      order.shippingCarrier === "Correios" &&
      order.shippingServiceCode &&
      String(order.shippingServiceCode).toUpperCase() !== "PREORDER",
  );
}

function buildPrePostageSummary(order) {
  return {
    prePostageId: order.correiosPrePostageId,
    receiptId: order.correiosReceiptId,
    trackingCode: order.correiosTrackingCode,
    status: order.correiosStatus,
    labelUrl: order.correiosLabelUrl,
    hasLabelBase64: Boolean(order.correiosLabelBase64),
  };
}

export async function createCorreiosPrePostageIfEligible(
  orderOrId,
  { customer } = {},
) {
  const mappedOrder =
    typeof orderOrId === "object" && orderOrId
      ? orderOrId
      : await prisma.asaasShopifyOrder.findUnique({
          where: { id: Number(orderOrId) },
        });

  if (!mappedOrder) {
    return { success: false, skipped: true, reason: "Order not found." };
  }

  if (!isEligibleForCorreiosPrePostage(mappedOrder)) {
    return {
      success: true,
      skipped: true,
      reason: "Order is not eligible for Correios pre-postage.",
      order: mappedOrder,
    };
  }

  return createCorreiosPrePostageForOrder(mappedOrder.id, { customer });
}

export async function createCorreiosPrePostageForOrder(
  orderId,
  { customer: providedCustomer } = {},
) {
  const id = Number(orderId);

  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("Invalid order id.");
  }

  const mappedOrder = await prisma.asaasShopifyOrder.findUnique({
    where: { id },
  });

  if (!mappedOrder) {
    throw new Error("Order not found.");
  }

  if (mappedOrder.status !== "PAID") {
    throw new Error("Order must be paid before Correios pre-postage.");
  }

  if (!mappedOrder.shopifyOrderId) {
    throw new Error("Order does not have a Shopify order id yet.");
  }

  if (mappedOrder.shippingCarrier !== "Correios" || !mappedOrder.shippingServiceCode) {
    throw new Error("Order does not have a Correios shipping option.");
  }

  if (mappedOrder.correiosPrePostageId) {
    if (!mappedOrder.correiosLabelUrl && !mappedOrder.correiosLabelBase64) {
      try {
        const labelResult = await generatePrePostageLabel(
          mappedOrder.correiosPrePostageId,
        );
        const trackingCode =
          labelResult.trackingCode || mappedOrder.correiosTrackingCode;
        let shopifyFulfillment = null;

        if (trackingCode && !mappedOrder.correiosTrackingCode) {
          shopifyFulfillment = await createShopifyFulfillmentWithTracking(
            mappedOrder.shopifyOrderId,
            trackingCode,
          );
        }

        await updateShopifyOrderCorreiosMetadata(mappedOrder.shopifyOrderId, {
          shippingStatus: SHIPPING_STATUS.PREPOSTED,
          prePostageId: mappedOrder.correiosPrePostageId,
          trackingCode,
          labelUrl: labelResult.labelUrl,
        });

        const updatedOrder = await prisma.asaasShopifyOrder.update({
          where: { id: mappedOrder.id },
          data: {
            correiosReceiptId:
              labelResult.receiptId || mappedOrder.correiosReceiptId,
            correiosTrackingCode: trackingCode,
            correiosStatus:
              labelResult.status || mappedOrder.correiosStatus || "PREPOSTED",
            correiosLabelUrl: labelResult.labelUrl,
            correiosLabelBase64: labelResult.labelBase64,
            correiosRawResponse: asJsonValue([
              mappedOrder.correiosRawResponse,
              labelResult.raw,
            ]),
            correiosLabelGeneratedAt:
              labelResult.labelUrl || labelResult.labelBase64
                ? new Date()
                : mappedOrder.correiosLabelGeneratedAt,
            correiosError: null,
          },
        });

        return {
          success: true,
          reused: true,
          order: updatedOrder,
          prePostage: buildPrePostageSummary(updatedOrder),
          shopifyFulfillment,
        };
      } catch (error) {
        const correiosError = truncateError(error);
        const updatedOrder = await prisma.asaasShopifyOrder.update({
          where: { id: mappedOrder.id },
          data: { correiosError },
        });

        return {
          success: true,
          reused: true,
          order: updatedOrder,
          prePostage: buildPrePostageSummary(updatedOrder),
          labelWarning: correiosError,
        };
      }
    }

    return {
      success: true,
      reused: true,
      order: mappedOrder,
      prePostage: buildPrePostageSummary(mappedOrder),
    };
  }

  const lock = await prisma.asaasShopifyOrder.updateMany({
    where: {
      id: mappedOrder.id,
      correiosPrePostageId: null,
      OR: [
        { shippingStatus: null },
        {
          shippingStatus: {
            in: [SHIPPING_STATUS.AWAITING_LABEL, SHIPPING_STATUS.ERROR],
          },
        },
      ],
    },
    data: {
      shippingStatus: SHIPPING_STATUS.CREATING_LABEL,
      correiosAttemptedAt: new Date(),
      correiosError: null,
    },
  });

  if (!lock.count) {
    const currentOrder = await prisma.asaasShopifyOrder.findUnique({
      where: { id: mappedOrder.id },
    });

    return {
      success: true,
      reused: Boolean(currentOrder?.correiosPrePostageId),
      inProgress:
        currentOrder?.shippingStatus === SHIPPING_STATUS.CREATING_LABEL,
      order: currentOrder,
      prePostage: buildPrePostageSummary(currentOrder || {}),
    };
  }

  let asaasCustomer = providedCustomer || {};

  if (!providedCustomer) {
    try {
      const { getAsaasCustomer } = await import("./asaas.server");
      asaasCustomer = await getAsaasCustomer(mappedOrder.asaasCustomerId);
    } catch (error) {
      console.warn("[correios] Failed to fetch Asaas customer for pre-postage.", {
        orderId: mappedOrder.id,
        asaasCustomerId: mappedOrder.asaasCustomerId,
        error: truncateError(error),
      });
    }
  }

  const customer = buildCustomerForPrePostage(asaasCustomer, mappedOrder);

  console.log("[correios] Starting manual pre-postage.", {
    orderId: mappedOrder.id,
    shopifyOrder: mappedOrder.shopifyOrderName,
    service: mappedOrder.shippingService,
    customer: sanitizeForLog(customer),
  });

  try {
    const creationResult = await createPrePostage({
      customer,
      service: mappedOrder.shippingService,
      serviceCode: mappedOrder.shippingServiceCode,
      items: [{}],
    });
    if (!creationResult.prePostageId) {
      throw new Error("Correios response did not include idPrePostagem.");
    }

    await prisma.asaasShopifyOrder.update({
      where: { id: mappedOrder.id },
      data: {
        shippingStatus: SHIPPING_STATUS.PREPOSTED,
        correiosPrePostageId: creationResult.prePostageId,
        correiosReceiptId: creationResult.receiptId,
        correiosTrackingCode: creationResult.trackingCode,
        correiosStatus: creationResult.status || "PREPOSTED",
        correiosLabelUrl: creationResult.labelUrl,
        correiosLabelBase64: creationResult.labelBase64,
        correiosRawResponse: asJsonValue(creationResult.raw),
        correiosPrePostedAt: new Date(),
        correiosError: null,
      },
    });

    let labelResult = null;
    let labelWarning = null;

    if (!creationResult.labelUrl && !creationResult.labelBase64) {
      try {
        labelResult = await generatePrePostageLabel(
          creationResult.prePostageId,
        );
      } catch (error) {
        labelWarning = truncateError(error);
        console.warn("[correios] Label generation failed after pre-postage.", {
          orderId: mappedOrder.id,
          prePostageId: creationResult.prePostageId,
          error: labelWarning,
        });
      }
    }

    const prePostage = mergeCorreiosResults(creationResult, labelResult);
    let shopifyFulfillment = null;
    let shopifyTrackingWarning = null;

    await updateShopifyOrderCorreiosMetadata(mappedOrder.shopifyOrderId, {
      shippingStatus: SHIPPING_STATUS.PREPOSTED,
      prePostageId: prePostage.prePostageId,
      trackingCode: prePostage.trackingCode,
      labelUrl: prePostage.labelUrl,
    });

    if (prePostage.trackingCode) {
      try {
        shopifyFulfillment = await createShopifyFulfillmentWithTracking(
          mappedOrder.shopifyOrderId,
          prePostage.trackingCode,
        );
      } catch (error) {
        shopifyTrackingWarning = truncateError(error);
        console.warn("[correios] Shopify tracking update failed.", {
          orderId: mappedOrder.id,
          shopifyOrderId: mappedOrder.shopifyOrderId,
          error: shopifyTrackingWarning,
        });
      }
    }

    const updatedOrder = await prisma.asaasShopifyOrder.update({
      where: { id: mappedOrder.id },
      data: {
        shippingStatus: SHIPPING_STATUS.PREPOSTED,
        correiosPrePostageId: prePostage.prePostageId,
        correiosReceiptId: prePostage.receiptId,
        correiosTrackingCode: prePostage.trackingCode,
        correiosStatus: prePostage.status || "PREPOSTED",
        correiosLabelUrl: prePostage.labelUrl,
        correiosLabelBase64: prePostage.labelBase64,
        correiosRawResponse: asJsonValue(prePostage.raw),
        correiosLabelGeneratedAt:
          prePostage.labelUrl || prePostage.labelBase64 ? new Date() : null,
        correiosError:
          [labelWarning, shopifyTrackingWarning].filter(Boolean).join("; ") ||
          null,
      },
    });

    return {
      success: true,
      reused: false,
      order: updatedOrder,
      prePostage: buildPrePostageSummary(updatedOrder),
      shopifyFulfillment,
      shopifyTrackingWarning,
      labelWarning,
    };
  } catch (error) {
    const correiosError = truncateError(error);
    const latestOrder = await prisma.asaasShopifyOrder.findUnique({
      where: { id: mappedOrder.id },
    });
    const prePostageWasCreated = Boolean(latestOrder?.correiosPrePostageId);
    const updatedOrder = await prisma.asaasShopifyOrder.update({
      where: { id: mappedOrder.id },
      data: {
        shippingStatus: prePostageWasCreated
          ? SHIPPING_STATUS.PREPOSTED
          : SHIPPING_STATUS.ERROR,
        correiosError,
      },
    });

    await updateShopifyOrderCorreiosMetadata(mappedOrder.shopifyOrderId, {
      shippingStatus: prePostageWasCreated
        ? SHIPPING_STATUS.PREPOSTED
        : SHIPPING_STATUS.ERROR,
      error: correiosError,
    }).catch((metadataError) => {
      console.warn("[correios] Shopify error metadata update failed.", {
        orderId: mappedOrder.id,
        error: truncateError(metadataError),
      });
    });

    return {
      success: false,
      order: updatedOrder,
      error: correiosError,
    };
  }
}

export { SHIPPING_STATUS };
