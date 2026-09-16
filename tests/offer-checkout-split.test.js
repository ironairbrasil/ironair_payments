import assert from "node:assert/strict";
import process from "node:process";
import test from "node:test";
import { PassThrough } from "node:stream";
import { createElement } from "react";
import { renderToPipeableStream } from "react-dom/server";
import { createServer } from "vite";

function render(element) {
  return new Promise((resolve, reject) => {
    const output = new PassThrough();
    let html = "";
    output.on("data", (chunk) => { html += chunk.toString(); });
    output.on("end", () => resolve(html));
    const stream = renderToPipeableStream(element, {
      onAllReady() { stream.pipe(output); },
      onShellError: reject,
      onError: reject,
    });
  });
}

test("split checkout still server-renders product, form and attribution", async () => {
  const keys = ["SHOPIFY_API_KEY", "SHOPIFY_API_SECRET", "SHOPIFY_APP_URL", "APP_URL", "ASAAS_ENV", "ASAAS_API_KEY", "ASAAS_WEBHOOK_TOKEN"];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    SHOPIFY_API_KEY: "test-key",
    SHOPIFY_API_SECRET: "test-secret",
    SHOPIFY_APP_URL: "https://payments.example",
    APP_URL: "https://payments.example",
    ASAAS_ENV: "sandbox",
    ASAAS_API_KEY: "test-key",
    ASAAS_WEBHOOK_TOKEN: "test-token",
  });
  const vite = await createServer({
    configFile: false,
    appType: "custom",
    esbuild: { jsx: "automatic" },
    ssr: { noExternal: ["react-router"] },
    plugins: [{
      name: "stub-unused-shopify-login",
      enforce: "pre",
      resolveId(source) {
        if (/shopify\.server(?:\.js)?$/.test(source)) return "\0test-shopify-login";
        if (source === "react-router") return "\0test-router-data";
      },
      load(id) {
        if (id === "\0test-shopify-login") return "export const login = () => null;";
        if (id === "\0test-router-data") return `
          let value;
          export const setLoaderData = (next) => { value = next; };
          export const useLoaderData = () => value;
          export const useLocation = () => ({ pathname: '/', search: '' });
          export const Form = () => null;
          export const data = (next) => next;
          export const redirect = () => null;
        `;
      },
    }],
    server: { middlewareMode: true, hmr: false, watch: null },
  });
  try {
    const index = await vite.ssrLoadModule("/app/routes/_index/route.jsx");
    const { setLoaderData } = await vite.ssrLoadModule("\0test-router-data");
    const checkout = await vite.ssrLoadModule("/app/routes/checkout-ironair.jsx");
    const request = new Request("https://pay.ironair.com.br/?source=offer&variantId=gid%3A%2F%2Fshopify%2FProductVariant%2F123&productId=456&title=Iron%20Air&variantTitle=220V&quantity=1&price=1499.00&utm_source=test&utm_campaign=safety");
    const data = { surface: "pay", ...(await checkout.loader({ request })) };
    assert.equal(data.items[0].variantId, "gid://shopify/ProductVariant/123");
    assert.equal(data.items[0].price, 1499);
    assert.equal(data.attribution.utm_campaign, "safety");
    setLoaderData(data);
    const html = await render(createElement(index.default));
    assert.match(html, /Iron Air/);
    assert.match(html, /type="email"/);
    assert.match(html, /checkout-ironair\.css/);
    assert.match(html, /1\.499,00/);
    assert.doesNotMatch(html, /Carregando checkout/);
  } finally {
    await vite.close();
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});
