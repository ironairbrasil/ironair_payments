import assert from "node:assert/strict";
import test from "node:test";

import { assertShopifyInventoryAvailable } from "../app/services/shopify-inventory.js";

test("blocks a tracked Shopify variant when inventory is insufficient", () => {
  assert.throws(
    () => assertShopifyInventoryAvailable({
      id: "gid://shopify/ProductVariant/1",
      title: "127V",
      inventoryQuantity: 0,
      inventoryPolicy: "DENY",
      inventoryItem: { id: "gid://shopify/InventoryItem/1", tracked: true },
    }, 1),
    /estoque suficiente/,
  );
});

test("allows available stock and Shopify continue-selling policy", () => {
  assert.doesNotThrow(() => assertShopifyInventoryAvailable({
    inventoryQuantity: 2,
    inventoryPolicy: "DENY",
    inventoryItem: { tracked: true },
  }, 2));
  assert.doesNotThrow(() => assertShopifyInventoryAvailable({
    inventoryQuantity: 0,
    inventoryPolicy: "CONTINUE",
    inventoryItem: { tracked: true },
  }, 1));
});
