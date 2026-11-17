import { errorCodeForStatus, readAdminError, validRequestId } from "../../shared/api-error";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId?: string;

  constructor(status: number, message: string, detail: { code?: string; requestId?: string } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = detail.code ?? errorCodeForStatus(status);
    this.requestId = detail.requestId;
  }
}

export async function apiErrorFromResponse(response: Response, fallback = `A operação falhou (HTTP ${response.status}).`): Promise<ApiError> {
  let payload: unknown;
  try { payload = await response.json(); } catch { /* HTML from Access/proxies and empty responses use the fallback. */ }
  const detail = readAdminError(payload);
  const legacy = payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string" ? payload.error : undefined;
  const headerId = response.headers.get("X-Request-ID");
  let message = detail?.message ?? legacy ?? fallback;
  if (response.status === 412 || response.status === 428) {
    message = "O registro mudou ou sua revisão não está disponível. Recarregue e revise antes de tentar novamente.";
  }
  return new ApiError(response.status, message, {
    code: detail?.code, requestId: detail?.requestId ?? (validRequestId(headerId) ? headerId : undefined),
  });
}

/** User-facing reference for support; provider diagnostics remain server-side. */
export function apiErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) return fallback;
  return error.requestId ? `${error.message} Referência: ${error.requestId}` : error.message;
}

export const ADMIN_MOCK_MODE: boolean =
  import.meta.env.MODE === "mock" && Boolean(import.meta.env.ADMIN_MOCK_MODE);

export const ADMIN_LOCAL_MODE: boolean =
  import.meta.env.MODE === "local-admin" && Boolean(import.meta.env.ADMIN_LOCAL_MODE);

let mockApiPromise: Promise<typeof import("../mocks/adminApi")> | undefined;

export async function adminFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  if (import.meta.env.MODE !== "mock" || !import.meta.env.ADMIN_MOCK_MODE) {
    return fetch(input, init);
  }

  mockApiPromise ??= import("../mocks/adminApi");
  const { handleMockAdminRequest } = await mockApiPromise;
  const request = input instanceof Request
    ? new Request(input, init)
    : new Request(new URL(input.toString(), window.location.origin), init);
  return handleMockAdminRequest(request);
}

export async function apiRequest<T>(path: string, init: RequestInit = {}, onRevision?: (revision: string | undefined) => void): Promise<T> {
  const response = await adminFetch(path, {
    ...init,
    credentials: "same-origin",
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });

  if (!response.ok) {
    throw await apiErrorFromResponse(response);
  }

  const etag = response.headers.get("ETag");
  onRevision?.(etag && /^"[^"\r\n]+"$/.test(etag) ? etag.slice(1, -1) : undefined);

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function revisionHeaders(revision: string | undefined): Record<string, string> {
  if (!revision || /["\r\n]/.test(revision)) {
    throw new ApiError(428, "Recarregue o registro e revise antes de salvar.");
  }
  return { "If-Match": `"${revision}"` };
}

export async function apiResource<T>(path: string): Promise<{ value: T; revision: string | undefined }> {
  let revision: string | undefined;
  const value = await apiRequest<T>(path, {}, (current) => { revision = current; });
  return { value, revision };
}
