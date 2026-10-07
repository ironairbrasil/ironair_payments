import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMetaPurchaseEventId,
  buildMetaPurchasePayload,
  buildMetaPurchaseUserData,
  ensureMetaPurchaseEventId,
  META_CAPI_TIMEOUT_MILLISECONDS,
  META_PURCHASE_MAX_RETRY_ATTEMPTS,
  sendMetaPurchaseForPaidOrder,
} from "../app/services/meta-capi.server.js";

function paidOrder(overrides = {}) {
  return {
    id: 42,
    status: "PAID",
    asaasPaymentId: "pay_42",
    externalReference: "ironair_web_42",
    shopifyOrderId: "gid://shopify/Order/42",
    value: 1349.1,
    attribution: {
      utm_source: "ig",
      utm_medium: "social",
      utm_content: "link_in_bio",
      fbclid: "CLICK123",
      _fbp: "fb.1.123.browser",
      _fbc: "fb.1.456.CLICK123",
    },
    checkoutData: {
      customer: {
        name: "Maria Oliveira",
        email: "maria@example.com",
        phone: "11999999999",
      },
      shippingAddress: {
        city: "São Paulo",
        provinceCode: "SP",
        postalCode: "01310100",
      },
      tracking: {
        clientIp: "203.0.113.10",
        userAgent: "Mozilla/5.0 Test",
      },
      items: [
        {
          variantId: "gid://shopify/ProductVariant/52109245186349",
          sku: "IRON-AIR-127V",
          title: "Iron Air",
          quantity: 1,
          price: 1499,
        },
      ],
    },
    metaPurchaseEventId: null,
    metaPurchaseStatus: null,
    metaPurchaseAttempts: 0,
    ...overrides,
  };
}

function createPrisma(order) {
  const state = { order: { ...order } };
  function matchesCondition(condition) {
    return Object.entries(condition).every(([key, value]) => {
      if (value && typeof value === "object" && "lt" in value) {
        return state.order[key] < value.lt;
      }
      return state.order[key] === value;
    });
  }
  return {
    state,
    asaasShopifyOrder: {
      async findUnique({ where }) {
        if (where.id !== state.order.id) return null;
        return { ...state.order };
      },
      async updateMany({ where, data }) {
        if (where.id !== state.order.id) return { count: 0 };
        if (where.status && where.status !== state.order.status) return { count: 0 };
        if (where.metaPurchaseAttempts?.lt !== undefined) {
          if (!(Number(state.order.metaPurchaseAttempts || 0) < where.metaPurchaseAttempts.lt)) {
            return { count: 0 };
          }
        }
        if (where.metaPurchaseEventId === null && state.order.metaPurchaseEventId !== null) {
          return { count: 0 };
        }
        if (where.OR) {
          const matches = where.OR.some((condition) => matchesCondition(condition));
          if (!matches) return { count: 0 };
        }
        Object.entries(data).forEach(([key, value]) => {
          if (value && typeof value === "object" && "increment" in value) {
            state.order[key] = (state.order[key] || 0) + value.increment;
          } else {
            state.order[key] = value;
          }
        });
        return { count: 1 };
      },
      async update({ where, data }) {
        if (where.id !== state.order.id) throw new Error("not found");
        Object.assign(state.order, data);
        return { ...state.order };
      },
    },
  };
}

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => "application/json" },
    async json() {
      return body;
    },
  };
}

test("PIX pago sends exactly one server-side Purchase", async () => {
  const prisma = createPrisma(paidOrder({ asaasPaymentId: "pay_pix", checkoutData: {
    ...paidOrder().checkoutData,
    tracking: { clientIp: "203.0.113.10", userAgent: "Pix UA" },
  } }));
  const calls = [];
  const result = await sendMetaPurchaseForPaidOrder(42, {
    prismaClient: prisma,
    env: { META_PIXEL_ID: "pixel", META_ACCESS_TOKEN: "token" },
    fetchImpl: async (url, options) => {
      calls.push({ url, payload: JSON.parse(options.body) });
      return jsonResponse(200, { events_received: 1 });
    },
  });

  assert.equal(result.success, true);
  assert.equal(calls.length, 1);
  assert.equal(prisma.state.order.metaPurchaseStatus, "SENT");
});

test("PIX criado e não pago does not send Purchase", async () => {
  const prisma = createPrisma(paidOrder({ status: "PENDING" }));
  let calls = 0;
  const result = await sendMetaPurchaseForPaidOrder(42, {
    prismaClient: prisma,
    env: { META_PIXEL_ID: "pixel", META_ACCESS_TOKEN: "token" },
    fetchImpl: async () => {
      calls += 1;
      return jsonResponse(200, {});
    },
  });

  assert.equal(result.reason, "ORDER_NOT_PAID");
  assert.equal(calls, 0);
});

test("cartão aprovado sends Purchase with the paid total", async () => {
  const prisma = createPrisma(paidOrder({ asaasPaymentId: "pay_card", value: 1499 }));
  let payload;
  await sendMetaPurchaseForPaidOrder(42, {
    prismaClient: prisma,
    env: { META_PIXEL_ID: "pixel", META_ACCESS_TOKEN: "token" },
    fetchImpl: async (_url, options) => {
      payload = JSON.parse(options.body);
      return jsonResponse(200, { events_received: 1 });
    },
  });

  assert.equal(payload.data[0].custom_data.value, 1499);
  assert.equal(payload.data[0].custom_data.currency, "BRL");
});

test("cartão recusado does not send Purchase", async () => {
  const prisma = createPrisma(paidOrder({ status: "FAILED" }));
  let calls = 0;
  const result = await sendMetaPurchaseForPaidOrder(42, {
    prismaClient: prisma,
    env: { META_PIXEL_ID: "pixel", META_ACCESS_TOKEN: "token" },
    fetchImpl: async () => {
      calls += 1;
      return jsonResponse(200, {});
    },
  });

  assert.equal(result.reason, "ORDER_NOT_PAID");
  assert.equal(calls, 0);
});

test("webhook duplicado never sends a second server-side Purchase", async () => {
  const prisma = createPrisma(paidOrder());
  let calls = 0;
  const options = {
    prismaClient: prisma,
    env: { META_PIXEL_ID: "pixel", META_ACCESS_TOKEN: "token" },
    fetchImpl: async () => {
      calls += 1;
      return jsonResponse(200, { events_received: 1 });
    },
  };

  await sendMetaPurchaseForPaidOrder(42, options);
  const duplicate = await sendMetaPurchaseForPaidOrder(42, options);

  assert.equal(calls, 1);
  assert.equal(duplicate.reason, "ALREADY_SENT");
});

test("polling and webhook close together share one claim", async () => {
  const prisma = createPrisma(paidOrder({ metaPurchaseStatus: "PROCESSING" }));
  let calls = 0;
  const result = await sendMetaPurchaseForPaidOrder(42, {
    prismaClient: prisma,
    env: { META_PIXEL_ID: "pixel", META_ACCESS_TOKEN: "token" },
    fetchImpl: async () => {
      calls += 1;
      return jsonResponse(200, {});
    },
  });

  assert.equal(result.reason, "IN_PROGRESS");
  assert.equal(calls, 0);
});

test("pedido legado PAID não envia CAPI", async () => {
  const prisma = createPrisma(paidOrder({ metaPurchaseStatus: "LEGACY_SKIPPED" }));
  let calls = 0;
  const result = await sendMetaPurchaseForPaidOrder(42, {
    prismaClient: prisma,
    env: { META_PIXEL_ID: "pixel", META_ACCESS_TOKEN: "token" },
    fetchImpl: async () => {
      calls += 1;
      return jsonResponse(200, {});
    },
  });

  assert.equal(result.reason, "LEGACY_SKIPPED");
  assert.equal(calls, 0);
});

test("pedido antigo PAID + webhook duplicado não envia CAPI", async () => {
  const prisma = createPrisma(paidOrder({ metaPurchaseStatus: "LEGACY_SKIPPED" }));
  let calls = 0;
  const result = await sendMetaPurchaseForPaidOrder(42, {
    prismaClient: prisma,
    env: { META_PIXEL_ID: "pixel", META_ACCESS_TOKEN: "token" },
    fetchImpl: async () => {
      calls += 1;
      return jsonResponse(200, {});
    },
  });

  assert.equal(result.reason, "LEGACY_SKIPPED");
  assert.equal(calls, 0);
});

test("pedido antigo PAID + polling status não envia CAPI", async () => {
  const prisma = createPrisma(paidOrder({ metaPurchaseStatus: "LEGACY_SKIPPED" }));
  let calls = 0;
  const result = await sendMetaPurchaseForPaidOrder(42, {
    prismaClient: prisma,
    env: { META_PIXEL_ID: "pixel", META_ACCESS_TOKEN: "token" },
    fetchImpl: async () => {
      calls += 1;
      return jsonResponse(200, {});
    },
  });

  assert.equal(result.reason, "LEGACY_SKIPPED");
  assert.equal(calls, 0);
});

test("pedido novo PAID envia CAPI normalmente", async () => {
  const prisma = createPrisma(paidOrder({ metaPurchaseStatus: null }));
  let calls = 0;
  const result = await sendMetaPurchaseForPaidOrder(42, {
    prismaClient: prisma,
    env: { META_PIXEL_ID: "pixel", META_ACCESS_TOKEN: "token" },
    fetchImpl: async () => {
      calls += 1;
      return jsonResponse(200, { events_received: 1 });
    },
  });

  assert.equal(result.success, true);
  assert.equal(calls, 1);
});

test("PROCESSING recente não permite novo claim", async () => {
  const prisma = createPrisma(paidOrder({
    metaPurchaseStatus: "PROCESSING",
    metaPurchaseAttemptedAt: new Date("2026-10-07T12:00:00Z"),
  }));
  const result = await sendMetaPurchaseForPaidOrder(42, {
    prismaClient: prisma,
    now: () => new Date("2026-10-07T12:10:00Z"),
    env: { META_PIXEL_ID: "pixel", META_ACCESS_TOKEN: "token" },
    fetchImpl: async () => jsonResponse(200, {}),
  });

  assert.equal(result.reason, "IN_PROGRESS");
});

test("PROCESSING stale permite retry com o mesmo event_id", async () => {
  const prisma = createPrisma(paidOrder({
    metaPurchaseEventId: "ironair_purchase_42",
    metaPurchaseStatus: "PROCESSING",
    metaPurchaseAttemptedAt: new Date("2026-10-07T11:00:00Z"),
    metaPurchaseAttempts: 1,
  }));
  let eventId;
  const result = await sendMetaPurchaseForPaidOrder(42, {
    prismaClient: prisma,
    now: () => new Date("2026-10-07T12:00:01Z"),
    env: { META_PIXEL_ID: "pixel", META_ACCESS_TOKEN: "token" },
    fetchImpl: async (_url, options) => {
      eventId = JSON.parse(options.body).data[0].event_id;
      return jsonResponse(200, { events_received: 1 });
    },
  });

  assert.equal(result.success, true);
  assert.equal(eventId, "ironair_purchase_42");
});

test("dois processos tentando recuperar stale simultaneamente só geram um envio", async () => {
  const prisma = createPrisma(paidOrder({
    metaPurchaseStatus: "PROCESSING",
    metaPurchaseAttemptedAt: new Date("2026-10-07T11:00:00Z"),
  }));
  let calls = 0;
  const options = {
    prismaClient: prisma,
    now: () => new Date("2026-10-07T12:00:01Z"),
    env: { META_PIXEL_ID: "pixel", META_ACCESS_TOKEN: "token" },
    fetchImpl: async () => {
      calls += 1;
      return jsonResponse(200, { events_received: 1 });
    },
  };

  const first = await sendMetaPurchaseForPaidOrder(42, options);
  const second = await sendMetaPurchaseForPaidOrder(42, options);

  assert.equal(first.success, true);
  assert.equal(second.reason, "ALREADY_SENT");
  assert.equal(calls, 1);
});

test("limite máximo de tentativas impede novo envio", async () => {
  const prisma = createPrisma(paidOrder({
    metaPurchaseStatus: "FAILED",
    metaPurchaseAttempts: META_PURCHASE_MAX_RETRY_ATTEMPTS,
  }));
  let calls = 0;
  const result = await sendMetaPurchaseForPaidOrder(42, {
    prismaClient: prisma,
    env: { META_PIXEL_ID: "pixel", META_ACCESS_TOKEN: "token" },
    fetchImpl: async () => {
      calls += 1;
      return jsonResponse(200, {});
    },
  });

  assert.equal(result.reason, "MAX_ATTEMPTS");
  assert.equal(calls, 0);
});

test("refresh da página de sucesso keeps the same persisted event id", async () => {
  const prisma = createPrisma(paidOrder());
  const first = await ensureMetaPurchaseEventId(prisma.state.order, { prismaClient: prisma });
  const second = await ensureMetaPurchaseEventId(prisma.state.order, { prismaClient: prisma });

  assert.equal(first, "ironair_purchase_42");
  assert.equal(second, first);
});

test("cliente fecha a página antes do pagamento still gets CAPI after paid backend state", async () => {
  const prisma = createPrisma(paidOrder());
  let calls = 0;
  await sendMetaPurchaseForPaidOrder(42, {
    prismaClient: prisma,
    env: { META_PIXEL_ID: "pixel", META_ACCESS_TOKEN: "token" },
    fetchImpl: async () => {
      calls += 1;
      return jsonResponse(200, { events_received: 1 });
    },
  });

  assert.equal(calls, 1);
  assert.equal(prisma.state.order.metaPurchaseStatus, "SENT");
});

test("Meta temporariamente indisponível can retry with the same event_id", async () => {
  const prisma = createPrisma(paidOrder());
  const eventIds = [];
  const fetchImpl = async (_url, options) => {
    const payload = JSON.parse(options.body);
    eventIds.push(payload.data[0].event_id);
    return eventIds.length === 1
      ? jsonResponse(503, { error: { message: "temporarily unavailable" } })
      : jsonResponse(200, { events_received: 1 });
  };

  const first = await sendMetaPurchaseForPaidOrder(42, {
    prismaClient: prisma,
    env: { META_PIXEL_ID: "pixel", META_ACCESS_TOKEN: "token" },
    fetchImpl,
  });
  const second = await sendMetaPurchaseForPaidOrder(42, {
    prismaClient: prisma,
    env: { META_PIXEL_ID: "pixel", META_ACCESS_TOKEN: "token" },
    fetchImpl,
  });

  assert.equal(first.retryable, true);
  assert.equal(second.success, true);
  assert.deepEqual(eventIds, ["ironair_purchase_42", "ironair_purchase_42"]);
});

test("timeout da Meta é retryable e preserva event_id", async () => {
  const prisma = createPrisma(paidOrder());
  const result = await sendMetaPurchaseForPaidOrder(42, {
    prismaClient: prisma,
    env: { META_PIXEL_ID: "pixel", META_ACCESS_TOKEN: "token" },
    fetchImpl: async (_url, options) => {
      options.signal.dispatchEvent(new Event("abort"));
      const error = new Error("aborted");
      error.name = "AbortError";
      throw error;
    },
  });

  assert.equal(result.retryable, true);
  assert.equal(result.eventId, "ironair_purchase_42");
  assert.equal(prisma.state.order.metaPurchaseLastError, `META_CAPI_TIMEOUT_${META_CAPI_TIMEOUT_MILLISECONDS}MS`);
});

test("HTTP 429 and 500 are retryable with sanitized response", async () => {
  for (const status of [429, 500]) {
    const prisma = createPrisma(paidOrder({ id: status }));
    const result = await sendMetaPurchaseForPaidOrder(status, {
      prismaClient: prisma,
      env: { META_PIXEL_ID: "pixel", META_ACCESS_TOKEN: "token" },
      fetchImpl: async () => jsonResponse(status, {
        error: {
          message: "Bad token access_token=SECRET and maria@example.com",
          type: "OAuthException",
          code: 190,
          fbtrace_id: "trace-id",
        },
      }),
    });

    assert.equal(result.retryable, true);
    assert.equal(prisma.state.order.metaPurchaseLastResponse.status, status);
    assert.equal(prisma.state.order.metaPurchaseLastResponse.message.includes("SECRET"), false);
    assert.equal(prisma.state.order.metaPurchaseLastResponse.message.includes("maria@example.com"), false);
    assert.equal(prisma.state.order.metaPurchaseLastResponse.fbtraceId, "trace-id");
  }
});

test("Meta indisponível não desfaz PAID", async () => {
  const prisma = createPrisma(paidOrder());
  await sendMetaPurchaseForPaidOrder(42, {
    prismaClient: prisma,
    env: { META_PIXEL_ID: "pixel", META_ACCESS_TOKEN: "token" },
    fetchImpl: async () => {
      throw new Error("network unavailable");
    },
  });

  assert.equal(prisma.state.order.status, "PAID");
  assert.equal(prisma.state.order.metaPurchaseStatus, "FAILED");
});

test("pedido com _fbp e _fbc sends browser identifiers unhashed", () => {
  const userData = buildMetaPurchaseUserData(paidOrder());

  assert.equal(userData.fbp, "fb.1.123.browser");
  assert.equal(userData.fbc, "fb.1.456.CLICK123");
  assert.equal(userData.client_ip_address, "203.0.113.10");
  assert.equal(userData.client_user_agent, "Mozilla/5.0 Test");
});

test("pedido sem _fbp/_fbc still sends hashed matching data", () => {
  const userData = buildMetaPurchaseUserData(paidOrder({ attribution: {} }));

  assert.equal(userData.fbp, undefined);
  assert.equal(userData.fbc, undefined);
  assert.match(userData.em, /^[a-f0-9]{64}$/);
  assert.match(userData.ph, /^[a-f0-9]{64}$/);
});

test("same event_id is used by Browser Pixel and CAPI", () => {
  const order = paidOrder({ metaPurchaseEventId: buildMetaPurchaseEventId(paidOrder()) });
  const payload = buildMetaPurchasePayload(order, { eventTime: 1 });
  const browserEventId = order.metaPurchaseEventId;

  assert.equal(payload.data[0].event_id, browserEventId);
  assert.equal(payload.data[0].custom_data.order_id, "gid://shopify/Order/42");
  assert.deepEqual(payload.data[0].custom_data.content_ids, ["IRON-AIR-127V"]);
  assert.equal(payload.data[0].custom_data.num_items, 1);
});
