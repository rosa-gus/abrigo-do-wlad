import {
  createFirestoreClient,
  FirestoreRestError,
} from "../_lib/firestore";
import { encryptData } from "../_lib/encryption";
import { sendEmail, generateAdoptionApplicationEmail } from "../_lib/email";
import { fullFormSchema } from "../../../../apps/public/src/pages/BetaForm/components/WizardForm/schema";
import { z } from "zod";
import { sanitizeFormFields, verifyRecaptcha } from "../_lib/security";
import {
  ADOPTION_EXPIRATION_DAYS,
  HTTP_STATUS,
} from "../_lib/constants";
import {
  jsonResponse,
  getEnvValue,
  type CloudflareEnv,
} from "../_lib/env";
import {
  readJsonBodyWithLimit,
  RequestBodyTooLargeError,
  validateRequest,
} from "../_lib/validation";
import { ADOPTION_RECAPTCHA_ACTION } from "../../../../apps/public/src/pages/BetaForm/components/WizardForm/recaptcha";

type AdoptionApplicationData = z.infer<typeof fullFormSchema>;

const IDEMPOTENCY_KEY_HEADER = "Idempotency-Key";
const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type AdoptionApplicationRepository = Pick<
  ReturnType<typeof createFirestoreClient>,
  "createDocument"
>;

export interface AdoptionApplicationDependencies {
  createFirestoreClient: (env?: CloudflareEnv) => AdoptionApplicationRepository;
  encryptData: typeof encryptData;
  verifyRecaptcha: typeof verifyRecaptcha;
  sendNotification: (
    applicationData: Record<string, unknown>,
    applicationId: string,
    env: CloudflareEnv,
  ) => Promise<boolean>;
  now: () => Date;
}

export function getIdempotencyKey(request: Request): string | undefined {
  const value = request.headers.get(IDEMPOTENCY_KEY_HEADER)?.trim();
  return value || undefined;
}

export function isValidIdempotencyKey(value: string): boolean {
  return UUID_V4_PATTERN.test(value);
}

async function sendAdoptionApplicationEmail(
  applicationData: Record<string, unknown>,
  applicationId: string,
  env: CloudflareEnv,
): Promise<boolean> {
  try {
    const { html, text } = generateAdoptionApplicationEmail(
      applicationData,
      applicationId,
      env,
    );

    await sendEmail(
      {
        subject: `Nova Candidatura de Adoção: ${applicationData.animal_especifico || "Geral"}`,
        html,
        text,
      },
      env,
    );
    return true;
  } catch (err) {
    console.error("Error sending adoption application email:", err);
    return false;
  }
}

const SENSITIVE_FIELDS = [
  "nome_adotante",
  "telefone",
  "email",
  "endereco",
  "redes_sociais",
  "renda_mensal",
  "empresa",
  "profissao",
  "idade",
];

const defaultDependencies: AdoptionApplicationDependencies = {
  createFirestoreClient,
  encryptData,
  verifyRecaptcha,
  sendNotification: sendAdoptionApplicationEmail,
  now: () => new Date(),
};

export function createAdoptionApplicationHandler(
  overrides: Partial<AdoptionApplicationDependencies> = {},
) {
  const dependencies: AdoptionApplicationDependencies = {
    ...defaultDependencies,
    ...overrides,
  };

  return async function onRequest({
    request,
    env,
  }: {
    request: Request;
    env: CloudflareEnv;
  }): Promise<Response> {
    const validationError = await validateRequest(
      request,
      { expectedMethod: "POST" },
      env,
    );
    if (validationError) {
      return validationError;
    }

    try {
      const rawData = await readJsonBodyWithLimit(request);
      const idempotencyKey = getIdempotencyKey(request);

      if (!idempotencyKey || !isValidIdempotencyKey(idempotencyKey)) {
        return jsonResponse(HTTP_STATUS.BAD_REQUEST, {
          message: "Missing or invalid idempotency key",
        });
      }

      const validationResult = fullFormSchema.safeParse(rawData);

      if (!validationResult.success) {
        return jsonResponse(HTTP_STATUS.BAD_REQUEST, {
          message: "Validation failed",
          errors: z.treeifyError(validationResult.error),
        });
      }

      const data: AdoptionApplicationData = validationResult.data;
      const recaptchaSecret = getEnvValue(env, "RECAPTCHA_SECRET_KEY");
      if (!recaptchaSecret) {
        return jsonResponse(HTTP_STATUS.INTERNAL_SERVER_ERROR, {
          message: "reCAPTCHA secret is not configured.",
        });
      }

      const captchaValid = await dependencies.verifyRecaptcha(
        data.captchaToken,
        env,
        {
          expectedAction: ADOPTION_RECAPTCHA_ACTION,
          expectedHostname: new URL(request.url).hostname,
        },
      );
      if (!captchaValid) {
        return jsonResponse(HTTP_STATUS.BAD_REQUEST, {
          message: "reCAPTCHA validation failed",
        });
      }

      const rawApplicationData = Object.fromEntries(
        Object.entries(data).filter(([key]) => key !== "captchaToken"),
      );
      const applicationData = sanitizeFormFields(rawApplicationData);
      const sensitiveData: Record<string, unknown> = {};
      const publicData: Record<string, unknown> = {};

      for (const [key, value] of Object.entries(applicationData)) {
        if (SENSITIVE_FIELDS.includes(key)) {
          sensitiveData[key] = value;
        } else {
          publicData[key] = value;
        }
      }

      const { encryptedData, keyVersion } =
        await dependencies.encryptData(sensitiveData, env);

      const expiresAt = new Date(dependencies.now().getTime());
      expiresAt.setDate(expiresAt.getDate() + ADOPTION_EXPIRATION_DAYS);

      const documentData = {
        ...publicData,
        sensitive: encryptedData,
        keyVersion,
        expiresAt,
        status: "pending",
      };

      const firestore = dependencies.createFirestoreClient(env);
      let applicationId: string;

      try {
        ({ id: applicationId } = await firestore.createDocument(
          "adoption_application",
          documentData,
          {
            serverTimestampFields: ["submittedAt"],
            documentId: idempotencyKey,
          },
        ));
      } catch (error) {
        if (error instanceof FirestoreRestError && error.status === 409) {
          return jsonResponse(HTTP_STATUS.OK, {
            message: "Application already submitted",
            data: {
              id: idempotencyKey,
              duplicate: true,
            },
          });
        }

        throw error;
      }

      const notificationEmailSent = await dependencies.sendNotification(
        applicationData,
        applicationId,
        env,
      );

      return jsonResponse(HTTP_STATUS.CREATED, {
        message: "Application submitted successfully",
        data: { id: applicationId, notificationEmailSent },
        ...(!notificationEmailSent
          ? {
              warning:
                "A candidatura foi salva, mas a notificação automática falhou. Guarde o ID e entre em contato com o abrigo.",
            }
          : {}),
      });
    } catch (err) {
      console.error("Error creating adoption application:", err);

      if (err instanceof RequestBodyTooLargeError) {
        return jsonResponse(HTTP_STATUS.PAYLOAD_TOO_LARGE, {
          message: "Request entity too large",
        });
      }

      if (err instanceof SyntaxError) {
        return jsonResponse(HTTP_STATUS.BAD_REQUEST, {
          message: "Invalid JSON",
        });
      }

      return jsonResponse(HTTP_STATUS.INTERNAL_SERVER_ERROR, {
        message: "Error creating adoption application",
      });
    }
  };
}

export const onRequest = createAdoptionApplicationHandler();
