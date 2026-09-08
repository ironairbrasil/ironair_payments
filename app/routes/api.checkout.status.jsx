import {
  getAsaasCustomer,
  getNormalizedAsaasPayment,
  isAsaasPaymentApproved,
} from "../services/asaas.server";
import {
  CHECKOUT_CORS_HEADERS,
  checkoutJson,
} from "../services/checkout-flow.server";
import { completeDraftOrderForAsaasPayment } from "../services/shopify-order.server";
import { createCorreiosPrePostageIfEligible } from "../services/correios-order.server";
import { syncPaidOrderToBase } from "../services/base-order-sync.server";
import prisma from "../db.server";

export async function loader({ request }) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: CHECKOUT_CORS_HEADERS,
    });
  }

  const url = new URL(request.url);
  const paymentId = url.searchParams.get("paymentId") || "";
  const externalReference = url.searchParams.get("externalReference") || "";

  if (!paymentId.startsWith("pay_")) {
    return checkoutJson(
      {
        success: false,
        error: "paymentId is invalid.",
      },
      { status: 400 },
    );
  }

  const mappedOrder = await prisma.asaasShopifyOrder.findUnique({
    where: { asaasPaymentId: paymentId },
    select: { externalReference: true },
  });
  if (!mappedOrder || !externalReference || mappedOrder.externalReference !== externalReference) {
    return checkoutJson({ success: false, error: "Payment not found." }, { status: 404 });
  }

  try {
    const payment = await getNormalizedAsaasPayment(paymentId);
    const paid = isAsaasPaymentApproved(payment);

    if (paid) {
      const asaasCustomer = await getAsaasCustomer(payment.customer);

      const completedOrder = await completeDraftOrderForAsaasPayment(paymentId, {
        asaasCustomerId: payment.customer,
        asaasCustomer,
        asaasPayment: payment,
        externalReference: payment.externalReference,
      });

      if (completedOrder) {
        await syncPaidOrderToBase(completedOrder, {
          customer: asaasCustomer,
          payment,
          event: "PAYMENT_STATUS_CONFIRMED",
        });
      }

      if (
        completedOrder &&
        [null, "AWAITING_LABEL"].includes(completedOrder.shippingStatus)
      ) {
        await createCorreiosPrePostageIfEligible(completedOrder, {
          customer: asaasCustomer,
        }).catch((error) => {
          console.warn("[correios] Checkout status pre-postage failed.", {
            orderId: completedOrder.id,
            error: error instanceof Error ? error.message : String(error),
          });
        });
      }
    }

    return checkoutJson({
      success: true,
      paid,
      status: payment.status,
      paymentId: payment.id,
      externalReference: payment.externalReference,
    });
  } catch (error) {
    return checkoutJson(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 400 },
    );
  }
}
