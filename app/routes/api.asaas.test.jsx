import { getAsaasConfig } from "../config/asaas.server";
import { testAsaasConnection } from "../services/asaas.server";

export async function loader() {
  try {
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
