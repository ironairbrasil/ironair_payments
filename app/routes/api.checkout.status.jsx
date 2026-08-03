import {
  getAsaasCustomer,
  getAsaasPayment,
  isAsaasPaymentApproved,
} from "../services/asaas.server";
import {
  CHECKOUT_CORS_HEADERS,
  checkoutJson,
} from "../services/checkout-flow.server";
import { completeDraftOrderForAsaasPayment } from "../services/shopify-order.server";
import { createCorreiosPrePostageIfEligible } from "../services/correios-order.server";

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

  if (!paymentId) {
    return checkoutJson(
      {
        success: false,
        error: "paymentId is required.",
      },
      { status: 400 },
    );
  }

  try {
    const payment = await getAsaasPayment(paymentId);
    const paid = isAsaasPaymentApproved(payment);

    if (paid) {
      const asaasCustomer = await getAsaasCustomer(payment.customer);

      const completedOrder = await completeDraftOrderForAsaasPayment(paymentId, {
        asaasCustomerId: payment.customer,
        asaasCustomer,
        asaasPayment: payment,
        externalReference: payment.externalReference || externalReference,
      });

      if (completedOrder) {
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
      externalReference: payment.externalReference || externalReference,
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
