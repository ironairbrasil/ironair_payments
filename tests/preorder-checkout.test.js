import assert from "node:assert/strict";

import {
  createPreorderShippingOption,
  namespaceCheckoutExternalReference,
  normalizeCheckoutQuantity,
} from "../app/services/preorder-checkout.server.js";

const basePayload = {
  externalReference: "test-order",
  paymentMethod: "PIX",
  customer: {
    name: "Cliente Teste",
    email: "cliente@example.com",
    cpfCnpj: "52998224725",
    phone: "11999999999",
  },
  shippingAddress: {
    postalCode: "01310100",
    address1: "Avenida Paulista",
    number: "1000",
    neighborhood: "Bela Vista",
    city: "São Paulo",
    provinceCode: "SP",
  },
  items: [
    {
      variantId: "123456789",
      quantity: 1,
      price: 0.01,
      title: "Valor não confiável vindo do cliente",
    },
  ],
};

const preorderShipping = createPreorderShippingOption(
  basePayload.shippingAddress.postalCode,
);

assert.equal(namespaceCheckoutExternalReference("test-order", "preorder"), "preorder_test-order");
assert.equal(preorderShipping.serviceCode, "PREORDER");
assert.equal(preorderShipping.price, 0);
assert.equal(preorderShipping.destinationCep, "01310100");
assert.equal(normalizeCheckoutQuantity(1, "preorder"), 1);

assert.throws(
  () => normalizeCheckoutQuantity(0, "preorder"),
  /Quantidade inválida/,
);

console.log("preorder-checkout: assertions passed");
