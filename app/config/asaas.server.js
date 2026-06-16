import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";

const VALID_ASAAS_ENVS = new Set(["sandbox", "production"]);
const ASAAS_ENV_KEYS = ["ASAAS_ENV", "ASAAS_API_KEY", "ASAAS_WEBHOOK_TOKEN"];

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

  return {
    env,
    apiKey: process.env.ASAAS_API_KEY,
    webhookToken: process.env.ASAAS_WEBHOOK_TOKEN,
    baseUrl:
      env === "production"
        ? "https://api.asaas.com/v3"
        : "https://sandbox.asaas.com/api/v3",
  };
}

export function validateAsaasStartupConfig() {
  const { apiKey, env } = getAsaasConfig();

  if (!apiKey) {
    console.warn("[asaas] ASAAS_API_KEY is not configured.");
  }

  if (!VALID_ASAAS_ENVS.has(env)) {
    console.warn(
      `[asaas] ASAAS_ENV "${env}" is invalid. Use "sandbox" or "production".`,
    );
  }
}
