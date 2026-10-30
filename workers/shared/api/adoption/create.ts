import { UpstreamTimeoutError } from "../_lib/timeout";
import { deliverNotification, NOTIFICATION_LEASE_MS, NOTIFICATION_WARNING } from "./notification";
import {
  createFirestoreClient,
  FirestoreRestError,
  type FirestoreDocument,
} from "../_lib/firestore";
import { encryptData } from "../_lib/encryption";
import { sendEmail, generateAdoptionApplicationEmail } from "../_lib/email";
import { fullFormSchema } from "../../../../apps/public/src/pages/BetaForm/components/WizardForm/schema";
import { z } from "zod";
import { isAcceptingApplications } from "./availability";
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
import {
  ADOPTION_RECAPTCHA_ACTION,
  isAdoptionRecaptchaBypassed,
} from "../../../../apps/public/src/pages/BetaForm/components/WizardForm/recaptcha";

type AdoptionApplicationData = z.infer<typeof fullFormSchema>;

const IDEMPOTENCY_KEY_HEADER = "Idempotency-Key";
const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type AdoptionApplicationRepository = Pick<
  ReturnType<typeof createFirestoreClient>,
  "createDocument" | "updateDocument"
> & { getDocument(path: string): Promise<FirestoreDocument<Record<string, unknown>> | null> };

export interface AdoptionApplicationDependencies {
  isAcceptingApplications: typeof isAcceptingApplications;
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

export async function fingerprintApplication(data: Record<string, unknown>): Promise<string> {
  const canonical = JSON.stringify(Object.fromEntries(Object.keys(data).sort()
    .filter((key) => key !== "captchaToken" && data[key] !== undefined)
    .map((key) => [key, data[key]])));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
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
        debug: isAdoptionRecaptchaBypassed(),
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
  isAcceptingApplications,
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
      // Read current settings on every submission, including from already-open tabs.
      let acceptingApplications: boolean;
      try {
        acceptingApplications = await dependencies.isAcceptingApplications(env);
      } catch {
        return jsonResponse(HTTP_STATUS.SERVICE_UNAVAILABLE, {
          message: "Não foi possível verificar a disponibilidade das candidaturas. Tente novamente mais tarde.",
        });
      }
      if (!acceptingApplications) {
        return jsonResponse(HTTP_STATUS.FORBIDDEN, {
          message: "O recebimento de candidaturas está temporariamente pausado. Suas respostas continuam nesta aba.",
        });
      }

      if (!isAdoptionRecaptchaBypassed()) {
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
      }

      const rawApplicationData = Object.fromEntries(
        Object.entries(data).filter(([key]) => key !== "captchaToken"),
      );
      const requestFingerprint = await fingerprintApplication(rawApplicationData);
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

      const notificationAttemptId = crypto.randomUUID();
      const documentData = {
        ...publicData,
        requestFingerprint,
        notificationStatus: "pending",
        notificationEmailSent: false,
        notificationAttemptId,
        notificationAttempts: 1,
        notificationLeaseUntil: new Date(dependencies.now().getTime() + NOTIFICATION_LEASE_MS),
        sensitive: encryptedData,
        keyVersion,
        expiresAt,
        status: "pending",
      };

      const firestore = dependencies.createFirestoreClient(env);
      let applicationId: string;
      let duplicate = false;

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
          applicationId = idempotencyKey;
          duplicate = true;
        } else {
          throw error;
        }
      }

      let notificationEmailSent = false;
      try {
        const document = await firestore.getDocument(`adoption_application/${applicationId}`);
        if (!document) throw new Error("Saved application could not be read.");
        if (duplicate && document.data.requestFingerprint !== requestFingerprint) {
          return jsonResponse(409, {
            code: "IDEMPOTENCY_CONTENT_MISMATCH",
            message: `A candidatura ${applicationId} já foi recebida, mas não foi possível confirmar estas respostas como as mesmas do envio original. As alterações não foram gravadas. Guarde o ID e entre em contato com o abrigo para corrigi-las.`,
            data: { id: applicationId },
          });
        }
        notificationEmailSent = await deliverNotification(
          firestore, document,
          () => dependencies.sendNotification(applicationData, applicationId, env),
          dependencies.now,
          duplicate ? undefined : notificationAttemptId,
        );
      } catch (error) {
        if (duplicate) throw error; // Do not confirm an unverified retry.
        console.error(JSON.stringify({ event: "adoption.notification.read.failed", id: applicationId }));
      }

      return jsonResponse(duplicate ? HTTP_STATUS.OK : HTTP_STATUS.CREATED, {
        message: duplicate ? "Application already submitted" : "Application submitted successfully",
        data: { id: applicationId, notificationEmailSent, ...(duplicate ? { duplicate: true } : {}) },
        ...(!notificationEmailSent
          ? {
              warning:
                NOTIFICATION_WARNING,
            }
          : {}),
      });
    } catch (err) {
      console.error("Error creating adoption application:", err);

      if (err instanceof UpstreamTimeoutError) {
        return jsonResponse(HTTP_STATUS.SERVICE_UNAVAILABLE, {
          message: "O serviço demorou para confirmar o envio. Suas respostas continuam nesta aba. Tente novamente.",
        });
      }

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
