export function assertShopifyInventoryAvailable(variant, quantity) {
  const inventoryQuantity = Number(variant.inventoryQuantity);
  const inventoryTracked = Boolean(variant.inventoryItem?.tracked);
  const inventoryPolicy = String(variant.inventoryPolicy || "DENY").toUpperCase();

  if (
    inventoryTracked &&
    inventoryPolicy === "DENY" &&
    (!Number.isFinite(inventoryQuantity) || inventoryQuantity < quantity)
  ) {
    throw new Error(
      `A variante ${variant.title || variant.id} não possui estoque suficiente na Shopify.`,
    );
  }

  return { inventoryQuantity, inventoryTracked, inventoryPolicy };
}
