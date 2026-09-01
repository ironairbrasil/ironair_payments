import assert from "node:assert/strict";
import test from "node:test";

import {
  assertBaseSyncWritesAllowed,
  parseProductMap,
} from "../app/config/base.server.js";
import {
  billingType,
  customerPayload,
  mappedProduct,
  paymentDueDate,
} from "../app/services/base-order-sync.server.js";

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
    { productId: 100704254, sku: "IRON-AIR-127V", quantity: 2 },
  );
});

test("maps legacy Iron Air variants when Shopify has no SKU", () => {
  const map = parseProductMap('{"IRON-AIR-127V":129733866,"IRON-AIR-220V":129733867}');
  assert.deepEqual(
    mappedProduct({ items: [{ sku: "", title: "Iron Air", variantTitle: "127V", quantity: 1 }] }, map),
    { productId: 129733866, sku: "IRON-AIR-127V", quantity: 1 },
  );
  assert.deepEqual(
    mappedProduct({ items: [{ title: "Iron Air", variantTitle: "220V", quantity: 1 }] }, map),
    { productId: 129733867, sku: "IRON-AIR-220V", quantity: 1 },
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
