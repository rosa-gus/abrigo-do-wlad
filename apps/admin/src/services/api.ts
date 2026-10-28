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

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
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
    throw new ApiError(response.status, message);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
