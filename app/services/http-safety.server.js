export const CHECKOUT_CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://ironair.com.br",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept",
};

export function checkoutJson(data, init = {}) {
  return Response.json(data, {
    ...init,
    headers: {
      ...CHECKOUT_CORS_HEADERS,
      ...(init.headers || {}),
    },
  });
}

export function isIncidentRecoveryAllowed(env = process.env) {
  return env.ENABLE_INCIDENT_RECOVERY_ROUTES === "true";
}
