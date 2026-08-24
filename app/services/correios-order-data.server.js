const NFE_KEY_PATTERN = /^\d{44}$/;

const NFE_KEY_NAMES = new Set([
  "chavenfe",
  "chavedeacesso",
  "nfechave",
  "nfeaccesskey",
  "nfekey",
]);
const NFE_STATUS_NAMES = new Set([
  "nfestatus",
  "statusnfe",
  "statusdanfe",
  "statusnotafiscal",
]);
const AUTHORIZED_NFE_STATUSES = new Set([
  "authorized",
  "autorizada",
  "autorizado",
  "approved",
  "aprovada",
  "100",
]);

function normalizedKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
}

function entriesFromOrder(order = {}) {
  return [
    ...(order.metafields?.nodes || []).map((field) => ({
      key: `${field.namespace || ""}.${field.key || ""}`,
      value: field.value,
    })),
    ...(order.customAttributes || []),
  ];
}

export function getAuthorizedNfe(order = {}) {
  const entries = entriesFromOrder(order);
  const keyEntry = entries.find((entry) => {
    const key = normalizedKey(entry.key);
    return [...NFE_KEY_NAMES].some((name) => key === name || key.endsWith(name));
  });
  const statusEntry = entries.find((entry) => {
    const key = normalizedKey(entry.key);
    return [...NFE_STATUS_NAMES].some((name) => key === name || key.endsWith(name));
  });
  const accessKey = String(keyEntry?.value || "").replace(/\D/g, "");
  const status = normalizedKey(statusEntry?.value);

  if (!NFE_KEY_PATTERN.test(accessKey)) {
    return { accessKey: null, sent: false, reason: "missing_or_invalid_access_key" };
  }

  if (!AUTHORIZED_NFE_STATUSES.has(status)) {
    return { accessKey: null, sent: false, reason: "nfe_not_authorized" };
  }

  return { accessKey, sent: true, reason: null };
}

function money(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : 0;
}

function weightInGrams(weight) {
  const value = Number(weight?.value);
  if (!Number.isFinite(value) || value <= 0) return undefined;

  const unit = String(weight.unit || "").toUpperCase();
  if (unit === "KILOGRAMS") return value * 1000;
  if (unit === "POUNDS") return value * 453.59237;
  if (unit === "OUNCES") return value * 28.349523125;
  return value;
}

function metafieldNumber(product, key) {
  const field = (product?.metafields || []).find((item) => item?.key === key);
  const value = Number(field?.value);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

export function buildCorreiosOrderData(order = {}) {
  const allItems = order.lineItems?.nodes || [];
  const items = allItems
    .map((item) => {
      const unitValue = money(
        item.discountedTotalSet?.shopMoney?.amount !== undefined
          ? Number(item.discountedTotalSet.shopMoney.amount) /
              Math.max(1, Number(item.quantity) || 1)
          : item.originalUnitPriceSet?.shopMoney?.amount,
      );
      const product = item.variant?.product;

      return {
        description: String(product?.title || item.title || "").trim(),
        quantity: Math.max(1, Number(item.quantity) || 1),
        value: unitValue,
        sku: item.sku || item.variant?.sku || "",
        weightGrams: weightInGrams(item.variant?.inventoryItem?.measurement?.weight),
        lengthCm: metafieldNumber(product, "length_cm"),
        widthCm: metafieldNumber(product, "width_cm"),
        heightCm: metafieldNumber(product, "height_cm"),
      };
    })
    // Free gifts/accessories remain on the order, but are not fiscal sale items.
    .filter((item) => item.description && item.value > 0);

  if (!items.length) {
    throw new Error("Shopify order does not contain a paid item for content declaration.");
  }

  return { items, nfe: getAuthorizedNfe(order) };
}
