import assert from "node:assert/strict";
import test from "node:test";

import {
  assertAsaasPaymentApproved,
  assertPaymentMatchesMappedOrder,
  canRetryWebhookEvent,
  getAsaasPaymentTotal,
  getBlockingPaymentStatus,
  isLegacyCheckoutAllowed,
  moneyInCents,
  withValidatedInstallmentDetails,
} from "../app/services/payment-integrity.server.js";
import {
  baseFinancialPayload,
} from "../app/services/base-order-sync.server.js";

test("uses the installment total instead of one installment", () => {
  const payment = {
    id: "pay_test",
    value: 124.91,
    installmentTotalValue: 1499,
  };
  assert.equal(getAsaasPaymentTotal(payment), 1499);
});

test("fails closed when an installment total is unavailable", () => {
  assert.equal(Number.isNaN(getAsaasPaymentTotal({ installment: "ins_1", value: 124.91 })), true);
});

test("requires complete Asaas installment metadata", () => {
  const normalized = withValidatedInstallmentDetails(
    { id: "pay_test", installment: "ins_1", value: 124.91 },
    { installmentCount: 12, value: 1499 },
  );
  assert.equal(normalized.installmentCount, 12);
  assert.equal(normalized.installmentTotalValue, 1499);
  assert.throws(
    () => withValidatedInstallmentDetails(
      { id: "pay_test", installment: "ins_1", value: 124.91 },
      { installmentCount: 12 },
    ),
    /INSTALLMENT_DETAILS_INCOMPLETE/,
  );
});

test("keeps product unit price and sends the full sale total to Base", () => {
  const financial = baseFinancialPayload(
    { value: 1499 },
    { value: 124.91, installmentCount: 12 },
    { productId: 1, quantity: 1, unitPrice: 1499 },
  );
  assert.equal(financial.orderItem.unitPrice, 1499);
  assert.equal(financial.orderPaymentValue, 1499);
  assert.equal(financial.asaasInstallmentValue, 124.91);
  assert.equal(financial.installmentCount, 12);
});

test("fails closed when the verified Base contract cannot represent a Pix discount", () => {
  assert.throws(
    () => baseFinancialPayload(
      { value: 1349.1, discountAmount: 149.9, shippingPrice: 0 },
      { value: 1349.1 },
      { productId: 1, quantity: 1, unitPrice: 1499 },
    ),
    /ADJUSTMENTS_UNSUPPORTED_BY_VERIFIED_CONTRACT/,
  );
});

test("fails closed when the verified Base contract cannot represent freight", () => {
  assert.throws(
    () => baseFinancialPayload(
      { value: 1529, discountAmount: 0, shippingPrice: 30 },
      { value: 1529 },
      { productId: 1, quantity: 1, unitPrice: 1499 },
    ),
    /ADJUSTMENTS_UNSUPPORTED_BY_VERIFIED_CONTRACT/,
  );
  assert.throws(
    () => baseFinancialPayload(
      { value: 1499 },
      { value: 1499 },
      { productId: 1, quantity: 1, unitPrice: null },
    ),
    /SHOPIFY_UNIT_PRICE_REQUIRED/,
  );
});

test("rejects mismatched payment identity, reference, customer, and total", () => {
  const order = {
    asaasPaymentId: "pay_expected",
    externalReference: "order-1",
    asaasCustomerId: "cus_1",
    value: 1499,
  };
  const valid = {
    id: "pay_expected",
    externalReference: "order-1",
    customer: "cus_1",
    value: 124.91,
    installmentTotalValue: 1499,
  };
  assert.doesNotThrow(() => assertPaymentMatchesMappedOrder(order, valid));
  assert.throws(() => assertPaymentMatchesMappedOrder(order, { ...valid, id: "pay_other" }), /ID_MISMATCH/);
  assert.throws(() => assertPaymentMatchesMappedOrder(order, { ...valid, externalReference: "order-2" }), /EXTERNAL_REFERENCE_MISMATCH/);
  assert.throws(() => assertPaymentMatchesMappedOrder(order, { ...valid, customer: "cus_2" }), /CUSTOMER_MISMATCH/);
  assert.throws(() => assertPaymentMatchesMappedOrder(order, { ...valid, installmentTotalValue: 1498.99 }), /VALUE_MISMATCH/);
  assert.throws(() => assertPaymentMatchesMappedOrder(order, { ...valid, externalReference: undefined }), /EXTERNAL_REFERENCE_MISMATCH/);
  assert.throws(() => assertPaymentMatchesMappedOrder(order, { ...valid, customer: undefined }), /CUSTOMER_MISMATCH/);
  assert.equal(moneyInCents(1499), 149900);
});

test("only accepts the current approved Asaas states", () => {
  assert.doesNotThrow(() => assertAsaasPaymentApproved({ status: "CONFIRMED" }));
  assert.doesNotThrow(() => assertAsaasPaymentApproved({ status: "RECEIVED" }));
  for (const status of ["OVERDUE", "DELETED", "REFUNDED", "CHARGEBACK_REQUESTED", undefined]) {
    assert.throws(() => assertAsaasPaymentApproved({ status }), /NOT_APPROVED/);
  }
});

test("legacy checkout endpoints are disabled in either production mode", () => {
  assert.equal(isLegacyCheckoutAllowed({ NODE_ENV: "production", ASAAS_ENV: "sandbox" }), false);
  assert.equal(isLegacyCheckoutAllowed({ NODE_ENV: "development", ASAAS_ENV: "production" }), false);
  assert.equal(isLegacyCheckoutAllowed({ NODE_ENV: "development", ASAAS_ENV: "sandbox" }), true);
});

test("classifies reversals and expired payments as blocking", () => {
  assert.deepEqual(getBlockingPaymentStatus("CHARGEBACK_REQUESTED"), {
    status: "CHARGEBACK_REQUESTED",
    reversal: true,
  });
  assert.deepEqual(getBlockingPaymentStatus("OVERDUE"), {
    status: "OVERDUE",
    reversal: false,
  });
  assert.equal(getBlockingPaymentStatus("CONFIRMED"), null);
});

test("retries failed or stale webhook events but not processed/in-flight events", () => {
  const staleBefore = new Date("2026-09-03T12:00:00Z");
  assert.equal(canRetryWebhookEvent({ status: "FAILED" }, staleBefore), true);
  assert.equal(canRetryWebhookEvent({ status: "PROCESSED" }, staleBefore), false);
  assert.equal(canRetryWebhookEvent({ status: "PROCESSING", processedAt: new Date("2026-09-03T11:00:00Z") }, staleBefore), true);
  assert.equal(canRetryWebhookEvent({ status: "PROCESSING", processedAt: new Date("2026-09-03T12:01:00Z") }, staleBefore), false);
});
