export interface AdminErrorDetail {
  code: string;
  message: string;
  requestId: string;
}

export interface AdminErrorResponse { error: AdminErrorDetail }

export function errorCodeForStatus(status: number): string {
  return ({ 400: "INVALID_REQUEST", 401: "UNAUTHORIZED", 403: "FORBIDDEN",
    404: "NOT_FOUND", 405: "METHOD_NOT_ALLOWED", 409: "CONFLICT",
    412: "REVISION_MISMATCH", 413: "BODY_TOO_LARGE", 415: "UNSUPPORTED_MEDIA_TYPE",
    428: "REVISION_REQUIRED", 429: "RATE_LIMITED", 503: "SERVICE_UNAVAILABLE",
    502: "UPSTREAM_ERROR", 504: "UPSTREAM_TIMEOUT" } as Record<number, string>)[status] ?? "INTERNAL_ERROR";
}

export function readAdminError(payload: unknown): AdminErrorDetail | undefined {
  if (!payload || typeof payload !== "object" || !("error" in payload)) return;
  const error = payload.error;
  if (!error || typeof error !== "object") return;
  if (!("code" in error) || typeof error.code !== "string" || !/^[A-Z][A-Z0-9_]{0,79}$/.test(error.code)
    || !("message" in error) || typeof error.message !== "string" || !error.message.trim()
    || !("requestId" in error) || !validRequestId(error.requestId)) return;
  return { code: error.code, message: error.message, requestId: error.requestId };
}

export function validRequestId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9:-]{1,128}$/.test(value);
}
