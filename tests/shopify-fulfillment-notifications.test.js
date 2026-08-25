import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Shopify fulfillment has the scopes required to read and create merchant-managed fulfillments", async () => {
  const config = await readFile(new URL("../shopify.app.toml", import.meta.url), "utf8");

  assert.match(config, /read_merchant_managed_fulfillment_orders/);
  assert.match(config, /write_merchant_managed_fulfillment_orders/);
});

test("Shopify fulfillment notifies the customer with the native shipping email", async () => {
  const service = await readFile(
    new URL("../app/services/shopify-order.server.js", import.meta.url),
    "utf8",
  );

  assert.match(
    service,
    /lineItemsByFulfillmentOrder:[\s\S]*?notifyCustomer:\s*true,[\s\S]*?trackingInfo:/,
  );
});
