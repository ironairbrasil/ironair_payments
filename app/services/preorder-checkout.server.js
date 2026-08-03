export const PREORDER_TYPE = "preorder";

export function createPreorderShippingOption(destinationCep) {
  return {
    carrier: "Iron Air",
    service: "PREORDER",
    serviceCode: "PREORDER",
    price: 0,
    originalPrice: 0,
    isFreeShipping: true,
    promotionLabel: "Frete Grátis - Pré-venda",
    title: "Frete Grátis - Pré-venda",
    destinationCep,
  };
}

export function normalizeCheckoutQuantity(value, orderType) {
  const rawQuantity = Number(value);

  if (orderType !== PREORDER_TYPE) {
    return Math.max(1, rawQuantity || 1);
  }

  if (!Number.isInteger(rawQuantity) || rawQuantity < 1 || rawQuantity > 100) {
    throw new Error("Quantidade inválida.");
  }

  return rawQuantity;
}

export function namespaceCheckoutExternalReference(reference, orderType) {
  if (orderType !== PREORDER_TYPE || reference.startsWith("preorder_")) {
    return reference;
  }

  return `preorder_${reference}`;
}
