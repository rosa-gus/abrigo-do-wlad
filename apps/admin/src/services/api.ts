export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
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
    let message = `A operação falhou (HTTP ${response.status}).`;
    try {
      const payload = (await response.json()) as { error?: unknown };
      if (typeof payload.error === "string") message = payload.error;
    } catch {
      // Responses without JSON still receive a useful HTTP error.
    }
    if (response.status === 412 || response.status === 428) {
      message = "O registro mudou ou sua revisão não está disponível. Recarregue e revise antes de tentar novamente.";
    }
    throw new ApiError(response.status, message);
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
