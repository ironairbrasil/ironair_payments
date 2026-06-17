import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";

const VALID_ASAAS_ENVS = new Set(["sandbox", "production"]);
const ASAAS_ENV_KEYS = [
  "APP_URL",
  "ASAAS_ENV",
  "ASAAS_API_KEY",
  "ASAAS_WEBHOOK_TOKEN",
];

try {
  const localEnv = parseEnv(readFileSync(".env", "utf8"));

  for (const key of ASAAS_ENV_KEYS) {
    if (!process.env[key] && localEnv[key]) {
      process.env[key] = localEnv[key];
    }
  }
} catch (error) {
  if (error?.code !== "ENOENT") {
    throw error;
  }
}

export function getAsaasConfig() {
  const env = process.env.ASAAS_ENV || "sandbox";
  const appUrl = process.env.APP_URL?.replace(/\/+$/, "");

  if (env === "production" && !appUrl) {
    throw new Error("APP_URL is not configured.");
  }

  return {
    env,
    appUrl,
    apiKey: process.env.ASAAS_API_KEY,
    webhookToken: process.env.ASAAS_WEBHOOK_TOKEN,
    baseUrl:
      env === "production"
        ? "https://api.asaas.com/v3"
        : "https://api-sandbox.asaas.com/v3",
  };
}

export function validateAsaasStartupConfig() {
  const { apiKey, appUrl, env, webhookToken } = getAsaasConfig();

  if (!apiKey) {
    console.warn("[asaas] ASAAS_API_KEY is not configured.");
  }

  if (!VALID_ASAAS_ENVS.has(env)) {
    console.warn(
      `[asaas] ASAAS_ENV "${env}" is invalid. Use "sandbox" or "production".`,
    );
  }

  if (env === "production" && !appUrl) {
    console.warn("[asaas] APP_URL is not configured.");
  }

  if (env === "production" && !webhookToken) {
    console.warn("[asaas] ASAAS_WEBHOOK_TOKEN is not configured.");
  }
}
