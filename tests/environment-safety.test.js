import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

import {
  assertAsaasEnvironmentSafety,
  assertBaseEnvironmentSafety,
  assertCorreiosEnvironmentSafety,
  validateRuntimeEnvironment,
} from "../app/config/environment-safety.server.js";

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

function stagingEnv(overrides = {}) {
  const asaasKey = "sandbox-asaas-key";
  return {
    APP_ENV: "staging",
    NODE_ENV: "production",
    VERCEL_ENV: "preview",
    APP_URL: "https://pay-staging.ironair.com.br",
    STAGING_APP_URL: "https://pay-staging.ironair.com.br",
    DATABASE_URL: "postgresql://user:pass@staging-pooler.neon.tech/staging?sslmode=require",
    DATABASE_URL_UNPOOLED: "postgresql://user:pass@staging.neon.tech/staging?sslmode=require",
    STAGING_DATABASE_HOST: "staging-pooler.neon.tech",
    STAGING_DATABASE_UNPOOLED_HOST: "staging.neon.tech",
    STAGING_DATABASE_NAME: "staging",
    PRODUCTION_DATABASE_HOST: "production-pooler.neon.tech",
    PRODUCTION_DATABASE_UNPOOLED_HOST: "production.neon.tech",
    ASAAS_ENV: "sandbox",
    ASAAS_API_KEY: asaasKey,
    ASAAS_SANDBOX_KEY_FINGERPRINT: sha256(asaasKey),
    SHOPIFY_APP_URL: "https://pay-staging.ironair.com.br",
    SHOPIFY_SHOP: "ironair-staging.myshopify.com",
    STAGING_SHOPIFY_SHOP: "ironair-staging.myshopify.com",
    PRODUCTION_SHOPIFY_SHOP: "ironair.myshopify.com",
    SHOPIFY_API_KEY: "staging-app-key",
    STAGING_SHOPIFY_API_KEY: "staging-app-key",
    PRODUCTION_SHOPIFY_API_KEY: "production-app-key",
    BASE_ENV: "sandbox",
    BASE_API_URL: "https://api-sandbox.baseerp.com.br",
    BASE_SYNC_ENABLED: "false",
    BASE_ALLOW_WRITES: "false",
    CORREIOS_ENABLED: "false",
    ...overrides,
  };
}

test("accepts only a fully isolated staging configuration", () => {
  const result = validateRuntimeEnvironment(stagingEnv());
  assert.equal(result.appEnv, "staging");
  assert.equal(result.shop, "ironair-staging.myshopify.com");
  assert.equal(result.correiosEnabled, false);
});

test("blocks staging connected to Asaas production or an unapproved key", () => {
  assert.throws(
    () => validateRuntimeEnvironment(stagingEnv({ ASAAS_ENV: "production" })),
    /STAGING_ASAAS_MUST_BE_SANDBOX/,
  );
  assert.throws(
    () => validateRuntimeEnvironment(stagingEnv({ ASAAS_API_KEY: "another-key" })),
    /STAGING_ASAAS_KEY_MISMATCH/,
  );
  assert.throws(
    () => assertAsaasEnvironmentSafety(stagingEnv({ ASAAS_ENV: "production" })),
    /STAGING_ASAAS_MUST_BE_SANDBOX/,
  );
});

test("blocks staging connected to the production database", () => {
  assert.throws(
    () => validateRuntimeEnvironment(stagingEnv({
      DATABASE_URL: "postgresql://user:pass@production-pooler.neon.tech/staging",
    })),
    /STAGING_DATABASE_MISMATCH|STAGING_DATABASE_IS_PRODUCTION/,
  );
  assert.throws(
    () => validateRuntimeEnvironment(stagingEnv({
      STAGING_DATABASE_HOST: "production-pooler.neon.tech",
    })),
    /STAGING_DATABASE_EQUALS_PRODUCTION/,
  );
});

test("blocks the production Shopify store and app in staging", () => {
  assert.throws(
    () => validateRuntimeEnvironment(stagingEnv({
      SHOPIFY_SHOP: "ironair.myshopify.com",
      STAGING_SHOPIFY_SHOP: "ironair.myshopify.com",
    })),
    /STAGING_SHOPIFY_SHOP_MISMATCH/,
  );
  assert.throws(
    () => validateRuntimeEnvironment(stagingEnv({
      SHOPIFY_API_KEY: "production-app-key",
    })),
    /STAGING_SHOPIFY_APP_MISMATCH/,
  );
});

test("blocks Base production and validates sandbox credentials before writes", () => {
  assert.throws(
    () => validateRuntimeEnvironment(stagingEnv({
      BASE_ENV: "production",
      BASE_API_URL: "https://api.baseerp.com.br",
    })),
    /STAGING_BASE_MUST_BE_SANDBOX/,
  );
  assert.throws(
    () => assertBaseEnvironmentSafety(stagingEnv({ BASE_API_URL: "https://api.baseerp.com.br" })),
    /STAGING_BASE_MUST_BE_SANDBOX/,
  );
  assert.throws(
    () => validateRuntimeEnvironment(stagingEnv({
      BASE_SYNC_ENABLED: "true",
      BASE_ALLOW_WRITES: "true",
      BASE_API_KEY: "sandbox-base-key",
      BASE_SANDBOX_KEY_FINGERPRINT: sha256("different-key"),
      BASE_ASAAS_BANK_ID: "1",
      BASE_PRODUCT_MAP_JSON: "{}",
    })),
    /STAGING_BASE_KEY_MISMATCH/,
  );
});

test("blocks every Correios network operation in staging", () => {
  assert.throws(
    () => validateRuntimeEnvironment(stagingEnv({ CORREIOS_ENABLED: "true" })),
    /STAGING_CORREIOS_MUST_BE_DISABLED/,
  );
  assert.throws(
    () => assertCorreiosEnvironmentSafety(stagingEnv()),
    /CORREIOS_DISABLED_IN_STAGING/,
  );
});

test("keeps the current Vercel production deploy compatible with canonical defaults", () => {
  const result = validateRuntimeEnvironment({
    NODE_ENV: "production",
    VERCEL_ENV: "production",
    ASAAS_ENV: "production",
  });
  assert.equal(result.appEnv, "production");
  assert.equal(result.appUrl, "https://pay.ironair.com.br");
  assert.equal(result.shopifyAppUrl, "https://pay.ironair.com.br");
});

test("requires explicit APP_ENV outside the recognized Vercel production runtime", () => {
  assert.throws(
    () => validateRuntimeEnvironment({ NODE_ENV: "production", APP_URL: "https://pay.ironair.com.br" }),
    /APP_ENV_REQUIRED/,
  );
});

test("production rejects non-canonical Shopify callbacks and mismatched protected resources", () => {
  const production = {
    APP_ENV: "production",
    APP_URL: "https://pay.ironair.com.br",
    SHOPIFY_APP_URL: "https://pay.ironair.com.br",
    ASAAS_ENV: "production",
  };
  assert.throws(
    () => validateRuntimeEnvironment({ ...production, SHOPIFY_APP_URL: "https://ironair-payments.vercel.app" }),
    /PRODUCTION_SHOPIFY_APP_URL_MISMATCH/,
  );
  assert.throws(
    () => validateRuntimeEnvironment({
      ...production,
      DATABASE_URL: "postgresql://user:pass@unexpected.example.com/payments",
      DATABASE_URL_UNPOOLED: "postgresql://user:pass@production.example.com/payments",
      PRODUCTION_DATABASE_HOST: "production.example.com",
    }),
    /PRODUCTION_DATABASE_MISMATCH/,
  );
  assert.throws(
    () => validateRuntimeEnvironment({
      ...production,
      BASE_SYNC_ENABLED: "true",
      BASE_ALLOW_WRITES: "true",
      BASE_ENV: "sandbox",
      BASE_API_URL: "https://api-sandbox.baseerp.com.br",
    }),
    /PRODUCTION_BASE_MISMATCH/,
  );
});

test("Correios respects the explicit kill switch in every environment", () => {
  assert.throws(
    () => assertCorreiosEnvironmentSafety({ APP_ENV: "production", CORREIOS_ENABLED: "false" }),
    /CORREIOS_DISABLED/,
  );
});
