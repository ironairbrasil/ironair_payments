import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCorreiosOrderData,
  getAuthorizedNfe,
} from "../app/services/correios-order-data.server.js";

const VALID_NFE_KEY = "3".repeat(44);

function orderWith(items, metafields = []) {
  return {
    customAttributes: [],
    metafields: { nodes: metafields },
    lineItems: {
      nodes: items.map((item) => ({
        title: item.title,
        quantity: item.quantity,
        discountedTotalSet: {
          shopMoney: { amount: String(item.total) },
        },
        variant: {
          sku: item.sku,
          inventoryItem: {
            measurement: { weight: { value: 1.2, unit: "KILOGRAMS" } },
          },
          product: { title: item.productTitle, metafields: [] },
        },
      })),
    },
  };
}

test("uses the real paid Iron Air item and sale value without an NF-e", () => {
  const result = buildCorreiosOrderData(
    orderWith([{ productTitle: "Passador de roupas elétrico Iron Air", quantity: 1, total: 899 }]),
  );

  assert.deepEqual(result.items.map(({ description, quantity, value }) => ({ description, quantity, value })), [
    { description: "Passador de roupas elétrico Iron Air", quantity: 1, value: 899 },
  ]);
  assert.equal(result.nfe.sent, false);
  assert.equal(result.nfe.reason, "missing_or_invalid_access_key");
});

test("sends only an authorized valid 44-digit NF-e key", () => {
  const result = getAuthorizedNfe({
    metafields: { nodes: [
      { namespace: "erp", key: "nfe_access_key", value: VALID_NFE_KEY },
      { namespace: "erp", key: "nfe_status", value: "AUTORIZADA" },
    ] },
  });

  assert.deepEqual(result, { accessKey: VALID_NFE_KEY, sent: true, reason: null });
  assert.equal(getAuthorizedNfe({
    metafields: { nodes: [
      { namespace: "erp", key: "nfe_access_key", value: VALID_NFE_KEY },
      { namespace: "erp", key: "nfe_status", value: "PENDENTE" },
    ] },
  }).sent, false);
});

test("reflects quantities greater than one and unit value", () => {
  const result = buildCorreiosOrderData(
    orderWith([{ productTitle: "Iron Air", quantity: 3, total: 2400 }]),
  );

  assert.equal(result.items[0].quantity, 3);
  assert.equal(result.items[0].value, 800);
});

test("does not let a free sprayer gift replace the paid Iron Air", () => {
  const result = buildCorreiosOrderData(orderWith([
    { productTitle: "Iron Air", quantity: 1, total: 899 },
    { productTitle: "Borrifador pressurizado Iron Air", quantity: 1, total: 0 },
  ]));

  assert.deepEqual(result.items.map((item) => item.description), ["Iron Air"]);
  assert.notEqual(result.items[0].value, 10);
});

test("keeps all paid products in a multi-item order", () => {
  const result = buildCorreiosOrderData(orderWith([
    { productTitle: "Iron Air 127V", quantity: 1, total: 899 },
    { productTitle: "Iron Air 220V", quantity: 2, total: 1700 },
  ]));

  assert.equal(result.items.length, 2);
  assert.deepEqual(result.items.map((item) => item.value), [899, 850]);
});
