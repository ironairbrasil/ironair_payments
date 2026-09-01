const SANDBOX_BASE_URL = "https://api-sandbox.baseerp.com.br";
const PRODUCTION_BASE_URL = "https://api.baseerp.com.br";

export function getBaseConfig() {
  const baseUrl = String(process.env.BASE_API_URL || SANDBOX_BASE_URL).replace(/\/+$/, "");
  const environment = String(process.env.BASE_ENV || "sandbox").toLowerCase();
  const productMap = parseProductMap(process.env.BASE_PRODUCT_MAP_JSON);

  return {
    apiKey: process.env.BASE_API_KEY,
    baseUrl,
    environment,
    enabled: process.env.BASE_SYNC_ENABLED === "true",
    allowWrites: process.env.BASE_ALLOW_WRITES === "true",
    bankId: Number(process.env.BASE_ASAAS_BANK_ID || 0),
    timeoutMs: Number(process.env.BASE_API_TIMEOUT_MS || 10000),
    productMap,
  };
}

export function assertBaseSyncWritesAllowed(config = getBaseConfig()) {
  if (!config.enabled) throw new Error("BASE_SYNC_DISABLED");
  if (!config.allowWrites) throw new Error("BASE_WRITES_DISABLED");
  const validEnvironmentUrl =
    (config.environment === "sandbox" && config.baseUrl === SANDBOX_BASE_URL) ||
    (config.environment === "production" && config.baseUrl === PRODUCTION_BASE_URL);
  if (!validEnvironmentUrl) throw new Error("BASE_ENV_URL_MISMATCH");
  if (!config.apiKey) throw new Error("BASE_API_KEY_NOT_CONFIGURED");
  if (!Number.isInteger(config.bankId) || config.bankId <= 0) {
    throw new Error("BASE_ASAAS_BANK_ID_NOT_CONFIGURED");
  }
}

export function parseProductMap(raw) {
  if (!raw) return {};
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("BASE_PRODUCT_MAP_JSON must be valid JSON.");
  }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error("BASE_PRODUCT_MAP_JSON must be an object keyed by SKU.");
  }
  return Object.fromEntries(
    Object.entries(parsed).map(([sku, id]) => {
      const productId = Number(id);
      if (!sku.trim() || !Number.isInteger(productId) || productId <= 0) {
        throw new Error("BASE_PRODUCT_MAP_JSON contains an invalid SKU or product ID.");
      }
      return [sku.trim().toUpperCase(), productId];
    }),
  );
}
