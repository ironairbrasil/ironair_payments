import { assertBaseSyncWritesAllowed, getBaseConfig } from "../config/base.server.js";

function formatBaseError(data) {
  if (typeof data === "string") return data;
  if (Array.isArray(data?.errors)) {
    return data.errors.map((error) => error.description || error.message || error.code).filter(Boolean).join("; ");
  }
  return JSON.stringify(data);
}

export async function requestBase(path, options = {}, fetcher = fetch) {
  const config = getBaseConfig();
  if (!path.startsWith("/api/v1/")) throw new Error("BASE_PATH_NOT_ALLOWED");
  if (options.method && options.method !== "GET") assertBaseSyncWritesAllowed(config);

  const response = await fetcher(`${config.baseUrl}${path}`, {
    ...options,
    headers: {
      accept: "application/json",
      access_token: config.apiKey,
      "content-type": "application/json",
      "user-agent": "ironair-payments/base-sync",
      ...options.headers,
    },
    signal: AbortSignal.timeout(config.timeoutMs),
  });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) {
    const error = new Error(`Base API HTTP ${response.status}: ${formatBaseError(data)}`);
    error.status = response.status;
    error.details = data;
    throw error;
  }
  return data;
}

export const getBaseCustomers = (query) =>
  requestBase(`/api/v1/customers?${new URLSearchParams(query).toString()}`);
export const createBaseCustomer = (body, idempotencyKey) =>
  requestBase("/api/v1/customers", { method: "POST", headers: { "Idempotency-Key": idempotencyKey }, body: JSON.stringify(body) });
export const getBaseOrders = (query) =>
  requestBase(`/api/v1/salesOrders?${new URLSearchParams(query).toString()}`);
export const createBaseOrder = (body, idempotencyKey) =>
  requestBase("/api/v1/salesOrders", { method: "POST", headers: { "Idempotency-Key": idempotencyKey }, body: JSON.stringify(body) });
