import crypto from "node:crypto";

const PRODUCTION_APP_URL = "https://pay.ironair.com.br";
const BASE_SANDBOX_URL = "https://api-sandbox.baseerp.com.br";
const BASE_PRODUCTION_URL = "https://api.baseerp.com.br";
const VALID_APP_ENVS = new Set(["development", "test", "staging", "production"]);

function required(env, key) {
  const value = String(env[key] || "").trim();
  if (!value) throw new Error(`ENV_SAFETY_${key}_REQUIRED`);
  return value;
}

function normalizedUrl(value, key) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") throw new Error("HTTPS_REQUIRED");
    return url.origin;
  } catch {
    throw new Error(`ENV_SAFETY_${key}_INVALID`);
  }
}

function databaseIdentity(value, key) {
  try {
    const url = new URL(value);
    return { host: url.hostname, database: url.pathname.replace(/^\//, "") };
  } catch {
    throw new Error(`ENV_SAFETY_${key}_INVALID`);
  }
}

function fingerprint(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

export function getAppEnvironment(env = process.env) {
  const appEnv = String(env.APP_ENV || "").trim().toLowerCase();
  if (!appEnv) {
    // Compatibility for the current Vercel production deployment. Explicit
    // APP_ENV remains mandatory everywhere else that runs NODE_ENV=production.
    if (env.VERCEL_ENV === "production") return "production";
    if (env.VERCEL_ENV || env.NODE_ENV === "production") {
      throw new Error("ENV_SAFETY_APP_ENV_REQUIRED");
    }
    return "development";
  }
  if (!VALID_APP_ENVS.has(appEnv)) throw new Error("ENV_SAFETY_APP_ENV_INVALID");
  return appEnv;
}

export function validateRuntimeEnvironment(env = process.env) {
  const appEnv = getAppEnvironment(env);
  const appUrl = normalizedUrl(
    env.APP_URL || (appEnv === "production" ? PRODUCTION_APP_URL : required(env, "APP_URL")),
    "APP_URL",
  );

  if (appEnv === "production") {
    if (appUrl !== PRODUCTION_APP_URL) throw new Error("ENV_SAFETY_PRODUCTION_APP_URL_MISMATCH");
    const shopifyAppUrl = normalizedUrl(env.SHOPIFY_APP_URL || appUrl, "SHOPIFY_APP_URL");
    if (shopifyAppUrl !== PRODUCTION_APP_URL) {
      throw new Error("ENV_SAFETY_PRODUCTION_SHOPIFY_APP_URL_MISMATCH");
    }
    if (String(env.ASAAS_ENV || "").toLowerCase() !== "production") {
      throw new Error("ENV_SAFETY_PRODUCTION_ASAAS_MISMATCH");
    }

    if (env.DATABASE_URL && env.DATABASE_URL_UNPOOLED) {
      const database = databaseIdentity(env.DATABASE_URL, "DATABASE_URL");
      const unpooled = databaseIdentity(env.DATABASE_URL_UNPOOLED, "DATABASE_URL_UNPOOLED");
      const expectedHost = String(env.PRODUCTION_DATABASE_HOST || "").trim();
      const expectedUnpooledHost = String(env.PRODUCTION_DATABASE_UNPOOLED_HOST || "").trim();
      const expectedDatabase = String(env.PRODUCTION_DATABASE_NAME || "").trim();
      if (
        (expectedHost && database.host !== expectedHost) ||
        (expectedUnpooledHost && unpooled.host !== expectedUnpooledHost) ||
        (expectedDatabase && (database.database !== expectedDatabase || unpooled.database !== expectedDatabase))
      ) {
        throw new Error("ENV_SAFETY_PRODUCTION_DATABASE_MISMATCH");
      }
    }

    const shop = String(env.SHOPIFY_SHOP || "").trim().toLowerCase();
    const expectedShop = String(env.PRODUCTION_SHOPIFY_SHOP || "").trim().toLowerCase();
    if (shop && (!shop.endsWith(".myshopify.com") || (expectedShop && shop !== expectedShop))) {
      throw new Error("ENV_SAFETY_PRODUCTION_SHOPIFY_SHOP_MISMATCH");
    }

    if (env.BASE_SYNC_ENABLED === "true" || env.BASE_ALLOW_WRITES === "true") {
      if (env.BASE_SYNC_ENABLED !== "true" || env.BASE_ALLOW_WRITES !== "true") {
        throw new Error("ENV_SAFETY_PRODUCTION_BASE_FLAGS_INCONSISTENT");
      }
      const baseUrl = normalizedUrl(required(env, "BASE_API_URL"), "BASE_API_URL");
      if (String(env.BASE_ENV || "").toLowerCase() !== "production" || baseUrl !== BASE_PRODUCTION_URL) {
        throw new Error("ENV_SAFETY_PRODUCTION_BASE_MISMATCH");
      }
    }

    return { appEnv, appUrl, shopifyAppUrl };
  }

  if (appEnv !== "staging") return { appEnv, appUrl };

  const stagingAppUrl = normalizedUrl(required(env, "STAGING_APP_URL"), "STAGING_APP_URL");
  if (appUrl !== stagingAppUrl || appUrl === PRODUCTION_APP_URL) {
    throw new Error("ENV_SAFETY_STAGING_APP_URL_MISMATCH");
  }
  if (normalizedUrl(required(env, "SHOPIFY_APP_URL"), "SHOPIFY_APP_URL") !== stagingAppUrl) {
    throw new Error("ENV_SAFETY_STAGING_SHOPIFY_APP_URL_MISMATCH");
  }
  if (String(env.ASAAS_ENV || "").toLowerCase() !== "sandbox") {
    throw new Error("ENV_SAFETY_STAGING_ASAAS_MUST_BE_SANDBOX");
  }
  const asaasKey = required(env, "ASAAS_API_KEY");
  if (fingerprint(asaasKey) !== required(env, "ASAAS_SANDBOX_KEY_FINGERPRINT").toLowerCase()) {
    throw new Error("ENV_SAFETY_STAGING_ASAAS_KEY_MISMATCH");
  }

  const database = databaseIdentity(required(env, "DATABASE_URL"), "DATABASE_URL");
  const unpooled = databaseIdentity(required(env, "DATABASE_URL_UNPOOLED"), "DATABASE_URL_UNPOOLED");
  const stagingDatabaseHost = required(env, "STAGING_DATABASE_HOST");
  const stagingDatabaseUnpooledHost = required(env, "STAGING_DATABASE_UNPOOLED_HOST");
  const stagingDatabaseName = required(env, "STAGING_DATABASE_NAME");
  const productionDatabaseHost = required(env, "PRODUCTION_DATABASE_HOST");
  const productionDatabaseUnpooledHost = required(env, "PRODUCTION_DATABASE_UNPOOLED_HOST");
  if (
    [stagingDatabaseHost, stagingDatabaseUnpooledHost].some((host) =>
      [productionDatabaseHost, productionDatabaseUnpooledHost].includes(host),
    )
  ) {
    throw new Error("ENV_SAFETY_STAGING_DATABASE_EQUALS_PRODUCTION");
  }
  if (
    database.host !== stagingDatabaseHost ||
    unpooled.host !== stagingDatabaseUnpooledHost ||
    database.database !== stagingDatabaseName ||
    unpooled.database !== stagingDatabaseName
  ) {
    throw new Error("ENV_SAFETY_STAGING_DATABASE_MISMATCH");
  }
  if (
    [database.host, unpooled.host].some((host) =>
      [productionDatabaseHost, productionDatabaseUnpooledHost].includes(host),
    )
  ) {
    throw new Error("ENV_SAFETY_STAGING_DATABASE_IS_PRODUCTION");
  }

  const shop = required(env, "SHOPIFY_SHOP").toLowerCase();
  const stagingShop = required(env, "STAGING_SHOPIFY_SHOP").toLowerCase();
  const productionShop = required(env, "PRODUCTION_SHOPIFY_SHOP").toLowerCase();
  if (!shop.endsWith(".myshopify.com") || shop !== stagingShop || shop === productionShop) {
    throw new Error("ENV_SAFETY_STAGING_SHOPIFY_SHOP_MISMATCH");
  }
  const shopifyApiKey = required(env, "SHOPIFY_API_KEY");
  const stagingShopifyApiKey = required(env, "STAGING_SHOPIFY_API_KEY");
  const productionShopifyApiKey = required(env, "PRODUCTION_SHOPIFY_API_KEY");
  if (shopifyApiKey !== stagingShopifyApiKey || shopifyApiKey === productionShopifyApiKey) {
    throw new Error("ENV_SAFETY_STAGING_SHOPIFY_APP_MISMATCH");
  }

  const baseEnvironment = String(env.BASE_ENV || "").toLowerCase();
  const baseUrl = normalizedUrl(required(env, "BASE_API_URL"), "BASE_API_URL");
  if (baseEnvironment !== "sandbox" || baseUrl !== BASE_SANDBOX_URL || baseUrl === BASE_PRODUCTION_URL) {
    throw new Error("ENV_SAFETY_STAGING_BASE_MUST_BE_SANDBOX");
  }
  if (env.BASE_SYNC_ENABLED === "true" || env.BASE_ALLOW_WRITES === "true") {
    if (env.BASE_SYNC_ENABLED !== "true" || env.BASE_ALLOW_WRITES !== "true") {
      throw new Error("ENV_SAFETY_STAGING_BASE_FLAGS_INCONSISTENT");
    }
    const baseApiKey = required(env, "BASE_API_KEY");
    if (fingerprint(baseApiKey) !== required(env, "BASE_SANDBOX_KEY_FINGERPRINT").toLowerCase()) {
      throw new Error("ENV_SAFETY_STAGING_BASE_KEY_MISMATCH");
    }
    required(env, "BASE_ASAAS_BANK_ID");
    required(env, "BASE_PRODUCT_MAP_JSON");
  }

  if (env.CORREIOS_ENABLED !== "false") {
    throw new Error("ENV_SAFETY_STAGING_CORREIOS_MUST_BE_DISABLED");
  }

  return { appEnv, appUrl, database, shop, baseUrl, correiosEnabled: false };
}

export function assertAsaasEnvironmentSafety(env = process.env) {
  const appEnv = getAppEnvironment(env);
  if (appEnv === "staging" && String(env.ASAAS_ENV || "").toLowerCase() !== "sandbox") {
    throw new Error("ENV_SAFETY_STAGING_ASAAS_MUST_BE_SANDBOX");
  }
}

export function assertBaseEnvironmentSafety(env = process.env) {
  const appEnv = getAppEnvironment(env);
  if (appEnv === "production" && (env.BASE_SYNC_ENABLED === "true" || env.BASE_ALLOW_WRITES === "true")) {
    const baseUrl = normalizedUrl(required(env, "BASE_API_URL"), "BASE_API_URL");
    if (
      env.BASE_SYNC_ENABLED !== "true" ||
      env.BASE_ALLOW_WRITES !== "true" ||
      String(env.BASE_ENV || "").toLowerCase() !== "production" ||
      baseUrl !== BASE_PRODUCTION_URL
    ) {
      throw new Error("ENV_SAFETY_PRODUCTION_BASE_MISMATCH");
    }
    return;
  }
  if (appEnv !== "staging") return;
  const baseUrl = normalizedUrl(required(env, "BASE_API_URL"), "BASE_API_URL");
  if (String(env.BASE_ENV || "").toLowerCase() !== "sandbox" || baseUrl !== BASE_SANDBOX_URL) {
    throw new Error("ENV_SAFETY_STAGING_BASE_MUST_BE_SANDBOX");
  }
}

export function assertCorreiosEnvironmentSafety(env = process.env) {
  const appEnv = getAppEnvironment(env);
  if (appEnv === "staging") {
    if (env.CORREIOS_ENABLED !== "false") {
      throw new Error("ENV_SAFETY_STAGING_CORREIOS_MUST_BE_DISABLED");
    }
    throw new Error("CORREIOS_DISABLED_IN_STAGING");
  }
  if (env.CORREIOS_ENABLED === "false") throw new Error("CORREIOS_DISABLED");
}
