import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { offerPixelBootstrap } from "../app/utils/offer-pixel-bootstrap.js";

function setup({ complete = false, idle = true } = {}) {
  const listeners = {};
  const scheduled = [];
  const scripts = [];
  const window = {
    addEventListener(name, callback) { listeners[name] = callback; },
    setTimeout(callback) { scheduled.push(callback); },
    ...(idle ? { requestIdleCallback(callback, options) {
      assert.equal(options.timeout, 1000);
      scheduled.push(callback);
    } } : {}),
  };
  const document = {
    readyState: complete ? "complete" : "loading",
    querySelector() { return scripts[0] || null; },
    createElement() { return {}; },
    head: { appendChild(script) { scripts.push(script); } },
  };
  vm.runInNewContext(offerPixelBootstrap, { window, document });
  return { window, listeners, scheduled, scripts };
}

test("offer pixel is automatic after load and never waits for interaction", () => {
  const state = setup();
  assert.equal(state.window.pixelId, "6aa1c3454dbf28bfd8efb9a4");
  assert.equal(state.scripts.length, 0);
  state.listeners.load();
  assert.equal(state.scripts.length, 0);
  state.scheduled[0]();
  assert.equal(state.scripts.length, 1);
  assert.equal(state.scripts[0].src, "https://cdn.utmify.com.br/scripts/pixel/pixel.js");
  assert.equal(state.scripts[0].async, true);
  state.scheduled[0]();
  assert.equal(state.scripts.length, 1);
});

test("offer pixel works on loaded pages without requestIdleCallback", () => {
  const state = setup({ complete: true, idle: false });
  assert.equal(state.scheduled.length, 1);
  state.scheduled[0]();
  assert.equal(state.scripts.length, 1);
});
