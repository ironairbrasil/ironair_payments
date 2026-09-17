import assert from "node:assert/strict";
import test from "node:test";

import {
  assertBaseSyncWritesAllowed,
  parseProductMap,
} from "../app/config/base.server.js";
import {
  baseFinancialPayload,
  baseOrderIssueDate,
  baseSalesOrderPayload,
  billingType,
  customerPayload,
  firstInstallmentDueDate,
  mappedProduct,
  paymentDueDate,
} from "../app/services/base-order-sync.server.js";

test("links Base payments to the existing Asaas installment instead of creating a new charge", () => {
  const financial = baseFinancialPayload(
    { value: 1499, discountAmount: 0, shippingPrice: 0 },
    { id: "pay_existing", value: 124.91, installmentCount: 12 },
    { productId: 100704254, quantity: 1, unitPrice: 1499 },
  );

  assert.equal(financial.asaasPaymentId, "pay_existing");
  assert.equal(financial.installmentCount, 12);
  assert.equal(financial.orderPaymentValue, 1499);
  assert.equal(financial.asaasInstallmentValue, 124.91);
});

test("links the Base order without sending a due date before the issue date", () => {
  const financial = baseFinancialPayload(
    { value: 1499, discountAmount: 0, shippingPrice: 0 },
    { id: "pay_confirmed", value: 749.5, installmentCount: 2 },
    { productId: 100704254, quantity: 1, unitPrice: 1499 },
  );
  const payload = baseSalesOrderPayload({
    issueDate: "2026-09-13",
    baseCustomerId: 120705151,
    bankId: 1001,
    payment: {
      id: "pay_confirmed",
      dueDate: "2026-09-11",
      billingType: "CREDIT_CARD",
    },
    financial,
  });

  assert.equal(payload.externalReference, "asaas:pay_confirmed");
  assert.equal(payload.orderItems[0].unitPrice, 1499);
  assert.equal(payload.orderPayments[0].paymentId, "pay_confirmed");
  assert.equal(payload.orderPayments[0].dueDate, "2026-09-13");
  assert.equal(payload.orderPayments[0].value, 749.5);
  assert.equal(payload.orderPayments[0].numberInstallments, 2);
});

test("starts Base installments from the first Asaas installment due date", () => {
  assert.equal(
    firstInstallmentDueDate(
      { dueDate: "2027-06-17", installmentNumber: 10 },
      "2026-09-17",
    ),
    "2026-09-17",
  );

  const financial = baseFinancialPayload(
    { value: 1499, discountAmount: 0, shippingPrice: 0 },
    { id: "pay_installment_10", value: 149.9, installmentCount: 10 },
    { productId: 100704254, quantity: 1, unitPrice: 1499 },
  );
  const payload = baseSalesOrderPayload({
    issueDate: "2026-09-17",
    baseCustomerId: 120893258,
    bankId: 1001,
    payment: {
      id: "pay_installment_10",
      dueDate: "2027-06-17",
      installmentNumber: 10,
      billingType: "CREDIT_CARD",
    },
    financial,
  });

  assert.equal(payload.orderPayments[0].dueDate, "2026-09-17");
  assert.equal(payload.orderPayments[0].numberInstallments, 10);
});

test("uses the original payment date when retrying a Base order later", () => {
  assert.equal(
    baseOrderIssueDate(
      { createdAt: new Date("2026-09-11T22:32:10Z") },
      { dateCreated: "2026-09-11", dueDate: "2026-09-11" },
    ),
    "2026-09-11",
  );
});

test("creates CPF customers as non-contributors and final consumers", () => {
  const payload = customerPayload({ id: "cus_test", name: "Cliente Teste" }, "12345678901");
  assert.deepEqual(payload.taxInformation, {
    stateInscription: "",
    typeOfTaxPayer: "NAO_CONTRIBUINTE",
    finalConsumer: true,
  });
});

test("Base writes require an exact environment/API pair", () => {
  const safe = {
    enabled: true,
    allowWrites: true,
    environment: "sandbox",
    baseUrl: "https://api-sandbox.baseerp.com.br",
    apiKey: "test",
    bankId: 100631123,
  };
  assert.doesNotThrow(() => assertBaseSyncWritesAllowed(safe));
  assert.doesNotThrow(() => assertBaseSyncWritesAllowed({
    ...safe,
    environment: "production",
    baseUrl: "https://api.baseerp.com.br",
  }));
  assert.throws(
    () => assertBaseSyncWritesAllowed({ ...safe, environment: "production" }),
    /BASE_ENV_URL_MISMATCH/,
  );
});

test("maps the frozen checkout SKU to a Base product", () => {
  const map = parseProductMap('{"IRON-AIR-127V":100704254}');
  assert.deepEqual(
    mappedProduct({ items: [{ sku: "iron-air-127v", quantity: 2 }] }, map),
    { productId: 100704254, sku: "IRON-AIR-127V", quantity: 2, unitPrice: null },
  );
});

test("maps legacy Iron Air variants when Shopify has no SKU", () => {
  const map = parseProductMap('{"IRON-AIR-127V":129733866,"IRON-AIR-220V":129733867}');
  assert.deepEqual(
    mappedProduct({ items: [{ sku: "", title: "Iron Air", variantTitle: "127V", quantity: 1 }] }, map),
    { productId: 129733866, sku: "IRON-AIR-127V", quantity: 1, unitPrice: null },
  );
  assert.deepEqual(
    mappedProduct({ items: [{ title: "Iron Air", variantTitle: "220V", quantity: 1 }] }, map),
    { productId: 129733867, sku: "IRON-AIR-220V", quantity: 1, unitPrice: null },
  );
});

test("maps persisted Shopify variant ids when legacy checkout data has no SKU or variant title", () => {
  const map = parseProductMap('{"IRON-AIR-127V":129733866,"IRON-AIR-220V":129733867}');
  assert.deepEqual(
    mappedProduct({ items: [{ variantId: "gid://shopify/ProductVariant/52109245186349", title: "Iron Air", quantity: 1 }] }, map),
    { productId: 129733866, sku: "IRON-AIR-127V", quantity: 1, unitPrice: null },
  );
  assert.deepEqual(
    mappedProduct({ items: [{ variantId: "gid://shopify/ProductVariant/52109245219117", title: "Iron Air", quantity: 1 }] }, map),
    { productId: 129733867, sku: "IRON-AIR-220V", quantity: 1, unitPrice: null },
  );
});

test("does not infer a SKU from an unknown title or variant", () => {
  const map = parseProductMap('{"IRON-AIR-127V":129733866}');
  assert.throws(
    () => mappedProduct({ items: [{ title: "Outro produto", variantTitle: "127V" }] }, map),
    /BASE_PRODUCT_MAPPING_MISSING:NO_SKU/,
  );
});

test("unknown products stop before creating a Base order", () => {
  assert.throws(
    () => mappedProduct({ items: [{ sku: "UNKNOWN", quantity: 1 }] }, {}),
    /BASE_PRODUCT_MAPPING_MISSING:UNKNOWN/,
  );
});

test("normalizes supported and unknown Base billing types", () => {
  assert.equal(billingType("pix"), "PIX");
  assert.equal(billingType("CREDIT_CARD"), "CREDIT_CARD");
  assert.equal(billingType("UNSUPPORTED"), "UNDEFINED");
});

test("never sends a Base payment due date before the order issue date", () => {
  assert.equal(paymentDueDate("2026-08-30", "2026-08-31"), "2026-08-31");
  assert.equal(paymentDueDate("", "2026-08-31"), "2026-08-31");
  assert.equal(paymentDueDate("2026-09-30", "2026-08-31"), "2026-09-30");
});
