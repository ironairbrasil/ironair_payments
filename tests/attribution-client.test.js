import assert from "node:assert/strict";
import test from "node:test";

import {
  appendAttributionToUrl,
  ATTRIBUTION_EXPIRATION_DAYS,
  captureAttribution,
  getPersistedAttribution,
  mergeAttribution,
} from "../app/utils/attribution.client.js";

function createStorage() {
  const data = new Map();
  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, String(value));
    },
    clear() {
      data.clear();
    },
  };
}

function installBrowser({ href = "https://oferta.ironair.com.br/?fbclid=CLICK123&utm_source=ig" } = {}) {
  const cookies = new Map();
  global.window = {
    location: new URL(href),
    localStorage: createStorage(),
    sessionStorage: createStorage(),
  };
  global.document = {
    get cookie() {
      return Array.from(cookies.entries())
        .map(([key, value]) => `${key}=${value}`)
        .join("; ");
    },
    set cookie(value) {
      const [pair] = String(value).split(";");
      const [key, cookieValue] = pair.split("=");
      cookies.set(key, cookieValue);
    },
  };
  return { cookies };
}

test("captures first-touch attribution and generates Meta fbc from fbclid", () => {
  const { cookies } = installBrowser();
  const now = Date.now();

  const attribution = captureAttribution({ now });

  assert.equal(attribution.utm_source, "ig");
  assert.equal(attribution.fbclid, "CLICK123");
  assert.equal(attribution._fbc, `fb.1.${now}.CLICK123`);
  assert.equal(cookies.get("_fbc"), `fb.1.${now}.CLICK123`);
  assert.deepEqual(getPersistedAttribution(), {
    utm_source: "ig",
    fbclid: "CLICK123",
    _fbc: `fb.1.${now}.CLICK123`,
  });
});

test("keeps existing URL attribution while filling missing persisted values", () => {
  const now = Date.now();
  installBrowser();
  captureAttribution({ now });
  window.location = new URL("https://pay.ironair.com.br/?utm_source=direct");

  const url = appendAttributionToUrl("https://pay.ironair.com.br/?utm_source=direct", getPersistedAttribution());
  const params = new URL(url).searchParams;

  assert.equal(params.get("utm_source"), "direct");
  assert.equal(params.get("fbclid"), "CLICK123");
  assert.equal(params.get("_fbc"), `fb.1.${now}.CLICK123`);
});

test("mergeAttribution lets later sources override earlier sources", () => {
  assert.deepEqual(
    mergeAttribution(
      { utm_source: "first", fbclid: "CLICK123" },
      { utm_source: "checkout", _fbp: "fb.1.1.abc" },
    ),
    { utm_source: "checkout", fbclid: "CLICK123", _fbp: "fb.1.1.abc" },
  );
});

test("novo fbclid tem prioridade sobre attribution persistida antiga", () => {
  installBrowser({ href: "https://oferta.ironair.com.br/?fbclid=OLD&utm_source=old" });
  captureAttribution({ now: 1000 });
  window.location = new URL("https://oferta.ironair.com.br/?fbclid=NEW&utm_source=new");
  document.cookie = "_fbc=;path=/;max-age=0";

  const attribution = captureAttribution({ now: 2000 });

  assert.equal(attribution.fbclid, "NEW");
  assert.equal(attribution.utm_source, "new");
  assert.equal(attribution._fbc, "fb.1.2000.NEW");
});

test("attribution expirada não é reaproveitada", () => {
  installBrowser({ href: "https://oferta.ironair.com.br/?fbclid=OLD&utm_source=old" });
  captureAttribution({ now: 1000 });
  window.sessionStorage.clear();
  document.cookie = "_fbc=;path=/;max-age=0";
  window.location = new URL("https://pay.ironair.com.br/");
  const expiredAt = 1000 + (ATTRIBUTION_EXPIRATION_DAYS + 1) * 24 * 60 * 60 * 1000;

  assert.deepEqual(captureAttribution({ now: expiredAt }), {});
});
