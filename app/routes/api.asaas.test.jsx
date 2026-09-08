import process from "node:process";

import { getAsaasConfig } from "../config/asaas.server";

export async function loader() {
  if (process.env.NODE_ENV === "production" || getAsaasConfig().env === "production") {
    return Response.json({ success: false, error: "Not found." }, { status: 404 });
  }
  try {
    const { testAsaasConnection } = await import("../services/asaas.server");
    const result = await testAsaasConnection();

    return Response.json(result, {
      status: result.success ? 200 : 500,
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        environment: getAsaasConfig().env,
        error: error.message,
      },
      { status: 500 }
    );
  }
}
