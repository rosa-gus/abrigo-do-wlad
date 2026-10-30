interface AdoptionSubmissionPayload {
  message?: unknown;
  warning?: unknown;
  data?: {
    id?: unknown;
    notificationEmailSent?: unknown;
  };
}

export const ADOPTION_IDEMPOTENCY_STORAGE_KEY =
  "adoptionSubmissionIdempotencyKey";

export function getOrCreateIdempotencyKey(storage?: Storage): string {
  try {
    const saved = (storage ?? window.sessionStorage).getItem(ADOPTION_IDEMPOTENCY_STORAGE_KEY)?.trim();

    if (saved) {
      return saved;
    }
  } catch {
    // The in-memory key held by the form still protects retries in this tab.
  }

  const key = crypto.randomUUID();

  try {
    (storage ?? window.sessionStorage).setItem(ADOPTION_IDEMPOTENCY_STORAGE_KEY, key);
  } catch {
    // Some privacy modes disable sessionStorage.
  }

  return key;
}

export function clearIdempotencyKey(storage?: Storage): void {
  try {
    (storage ?? window.sessionStorage).removeItem(ADOPTION_IDEMPOTENCY_STORAGE_KEY);
  } catch {
    // Nothing to clear when sessionStorage is unavailable.
  }
}

export interface AdoptionSubmissionResult {
  applicationId: string;
  warning?: string;
}

async function readPayload(
  response: Response,
): Promise<AdoptionSubmissionPayload> {
  try {
    const payload: unknown = await response.json();
    return typeof payload === "object" && payload !== null && !Array.isArray(payload)
      ? payload as AdoptionSubmissionPayload
      : {};
  } catch {
    return {};
  }
}

export async function sendAdoptionApplication(
  payload: Record<string, unknown>,
  idempotencyKey: string,
): Promise<AdoptionSubmissionResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch("/api/adoption/create", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    return await getAdoptionApplicationId(response);
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error("O servidor demorou para confirmar o envio. Suas respostas continuam nesta aba. Tente enviar novamente para confirmar sua candidatura.");
    }
    if (error instanceof TypeError) {
      throw new Error("Não conseguimos conectar ao servidor. Verifique sua conexão e tente novamente.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function getAdoptionApplicationId(
  response: Response,
): Promise<AdoptionSubmissionResult> {
  const payload = await readPayload(response);

  if (!response.ok) {
    throw new Error(
      typeof payload.message === "string" && payload.message.trim()
        ? payload.message
        : "Erro ao enviar formulário. Tente novamente.",
    );
  }

  const applicationId = payload.data?.id;
  if (typeof applicationId !== "string" || !applicationId.trim()) {
    throw new Error("A API não retornou o ID da candidatura.");
  }

  const warning =
    typeof payload.warning === "string" && payload.warning.trim()
      ? payload.warning
      : undefined;

  return {
    applicationId,
    ...(warning ? { warning } : {}),
  };
}
