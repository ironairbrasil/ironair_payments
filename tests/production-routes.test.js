import assert from "node:assert/strict";
import process from "node:process";
import test from "node:test";
import { createServer } from "vite";

async function loadRoutes() {
  const vite = await createServer({
    configFile: false,
    appType: "custom",
    server: { middlewareMode: true, hmr: false, watch: null },
  });
  try {
    const [asaasTest, checkoutStart, checkoutTest, baseIncident, correiosRepair] = await Promise.all([
      vite.ssrLoadModule("/app/routes/api.asaas.test.jsx"),
      vite.ssrLoadModule("/app/routes/api.checkout.start.jsx"),
      vite.ssrLoadModule("/app/routes/api.checkout.test.jsx"),
      vite.ssrLoadModule("/app/routes/api.admin.base.detach-payment.jsx"),
      vite.ssrLoadModule("/app/routes/api.admin.orders.$id.correios.repair.jsx"),
    ]);
    return { asaasTest, checkoutStart, checkoutTest, baseIncident, correiosRepair };
  } finally {
    await vite.close();
  }
}

test("production test routes return 404 before reading their request body", async () => {
  const keys = ["NODE_ENV", "ASAAS_ENV", "APP_URL", "ASAAS_API_KEY", "ASAAS_WEBHOOK_TOKEN", "SHOPIFY_API_KEY", "SHOPIFY_API_SECRET", "SHOPIFY_APP_URL"];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    NODE_ENV: "production",
    ASAAS_ENV: "production",
    APP_URL: "https://payments.example",
    ASAAS_API_KEY: "test-key",
    ASAAS_WEBHOOK_TOKEN: "test-token",
    SHOPIFY_API_KEY: "test-key",
    SHOPIFY_API_SECRET: "test-secret",
    SHOPIFY_APP_URL: "https://payments.example",
  });
  try {
    const routes = await loadRoutes();
    const unreadableBody = new ReadableStream({
      pull(controller) {
        controller.error(new Error("BODY_MUST_NOT_BE_READ"));
      },
    });
    const request = new Request("https://payments.example/api/test", {
      method: "POST",
      body: unreadableBody,
      duplex: "half",
    });
    assert.equal((await routes.checkoutStart.action({ request })).status, 404);
    assert.equal((await routes.checkoutTest.action({ request })).status, 404);
    assert.equal((await routes.asaasTest.loader()).status, 404);
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});

test("incident recovery routes are disabled unless explicitly enabled", async () => {
  const keys = ["ENABLE_INCIDENT_RECOVERY_ROUTES", "APP_URL", "ASAAS_ENV", "ASAAS_API_KEY", "ASAAS_WEBHOOK_TOKEN", "SHOPIFY_API_KEY", "SHOPIFY_API_SECRET", "SHOPIFY_APP_URL"];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  delete process.env.ENABLE_INCIDENT_RECOVERY_ROUTES;
  Object.assign(process.env, {
    APP_URL: "https://payments.example",
    ASAAS_ENV: "sandbox",
    ASAAS_API_KEY: "test-key",
    ASAAS_WEBHOOK_TOKEN: "test-token",
    SHOPIFY_API_KEY: "test-key",
    SHOPIFY_API_SECRET: "test-secret",
    SHOPIFY_APP_URL: "https://payments.example",
  });
  try {
    const routes = await loadRoutes();
    const request = new Request("https://payments.example/api/admin", { method: "POST" });
    assert.equal((await routes.baseIncident.action({ request })).status, 404);
    assert.equal((await routes.correiosRepair.loader({ request, params: { id: "38" } })).status, 404);
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});
