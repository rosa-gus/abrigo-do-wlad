import { sendEmail, generateAdoptionApplicationEmail } from "../_lib/email";
import { HTTP_STATUS } from "../_lib/constants";
import { getEnvValue, jsonResponse, type CloudflareEnv } from "../_lib/env";

export async function onRequest({
  request,
  env,
}: {
  request: Request;
  env: CloudflareEnv;
}) {
  if (request.method !== "GET") {
    return jsonResponse(HTTP_STATUS.METHOD_NOT_ALLOWED, {
      message: "Method not allowed",
    });
  }

  if (getEnvValue(env, "APP_ENV") !== "local") {
    return jsonResponse(HTTP_STATUS.FORBIDDEN, {
      message: "Not available in production",
    });
  }

  try {
    const mockApplicationData = {
      nome_adotante: "José da Silva Teste",
      animal_especifico: "Rex (Debug Mode)",
    };

    const mockApplicationId = "test-id-123456789";

    const { html, text } = generateAdoptionApplicationEmail(
      mockApplicationData,
      mockApplicationId,
      env,
    );

    await sendEmail(
      {
        subject: `[TESTE DEBUG] Nova Candidatura de Adoção: ${mockApplicationData.animal_especifico}`,
        html,
        text,
        debug: true,
      },
      env,
    );

    return jsonResponse(HTTP_STATUS.OK, {
      message: "Debug email sent successfully",
    });
  } catch (err) {
    console.error("Error sending debug email:", err);

    return jsonResponse(HTTP_STATUS.INTERNAL_SERVER_ERROR, {
      message: err instanceof Error ? err.message : "Default error",
    });
  }
}
