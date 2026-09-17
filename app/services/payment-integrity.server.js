export function moneyInCents(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return null;
  return Math.round(amount * 100);
}

export function getAsaasPaymentTotal(payment = {}) {
  if (
    payment.installment &&
    payment.installmentTotalValue === undefined &&
    payment.totalValue === undefined &&
    payment.originalValue === undefined
  ) {
    return Number.NaN;
  }
  return Number(
    payment.installmentTotalValue ??
      payment.totalValue ??
      payment.originalValue ??
      payment.value,
  );
}

export function assertPaymentIdentityMatchesMappedOrder(mappedOrder, payment) {
  if (!mappedOrder || !payment?.id) {
    throw new Error("PAYMENT_ORDER_MAPPING_REQUIRED");
  }

  const samePaymentId = mappedOrder.asaasPaymentId === payment.id;
  const sameExternalReference =
    mappedOrder.externalReference &&
    mappedOrder.externalReference === payment.externalReference;

  if (!samePaymentId && !sameExternalReference) {
    throw new Error("PAYMENT_ORDER_ID_MISMATCH");
  }

  if (
    mappedOrder.externalReference &&
    mappedOrder.externalReference !== payment.externalReference
  ) {
    throw new Error("PAYMENT_ORDER_EXTERNAL_REFERENCE_MISMATCH");
  }

  if (
    mappedOrder.asaasCustomerId &&
    mappedOrder.asaasCustomerId !== payment.customer
  ) {
    throw new Error("PAYMENT_ORDER_CUSTOMER_MISMATCH");
  }

}

export function assertPaymentMatchesMappedOrder(mappedOrder, payment) {
  assertPaymentIdentityMatchesMappedOrder(mappedOrder, payment);
  const orderTotal = moneyInCents(mappedOrder.value);
  const paymentTotal = moneyInCents(getAsaasPaymentTotal(payment));
  if (orderTotal === null || paymentTotal === null || orderTotal !== paymentTotal) {
    throw new Error("PAYMENT_ORDER_VALUE_MISMATCH");
  }
}

export function assertAsaasPaymentApproved(payment) {
  if (!new Set(["RECEIVED", "CONFIRMED"]).has(String(payment?.status || "").toUpperCase())) {
    throw new Error("ASAAS_PAYMENT_NOT_APPROVED");
  }
}

export function withValidatedInstallmentDetails(payment, installment) {
  const installmentCount = Number(installment?.installmentCount);
  const installmentTotalValue = Number(installment?.value);
  if (
    !Number.isInteger(installmentCount) ||
    installmentCount < 2 ||
    !Number.isFinite(installmentTotalValue) ||
    installmentTotalValue <= 0
  ) {
    throw new Error("ASAAS_INSTALLMENT_DETAILS_INCOMPLETE");
  }
  return { ...payment, installmentCount, installmentTotalValue };
}

export function isLegacyCheckoutAllowed(env = process.env) {
  return env.NODE_ENV !== "production" && env.ASAAS_ENV !== "production";
}

export function getBlockingPaymentStatus(status) {
  const normalized = String(status || "").toUpperCase();
  if (["REFUNDED", "CHARGEBACK_REQUESTED", "CHARGEBACK_DISPUTE", "AWAITING_CHARGEBACK_REVERSAL"].includes(normalized)) {
    return { status: normalized, reversal: true };
  }
  if (["OVERDUE", "DELETED"].includes(normalized)) {
    return { status: normalized, reversal: false };
  }
  return null;
}

export function canRetryWebhookEvent(event, staleBefore) {
  if (!event) return false;
  if (event.status === "FAILED") return true;
  if (!["RECEIVED", "PROCESSING"].includes(event.status)) return false;
  const activityAt = event.processedAt || event.receivedAt;
  return Boolean(activityAt && new Date(activityAt) < staleBefore);
}
