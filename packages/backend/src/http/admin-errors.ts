import { errorCodeForStatus, readAdminError, type AdminErrorResponse } from "@abrigo/contracts/errors";
import { FirestoreRestError } from "../adapters/firestore";
import { UpstreamTimeoutError } from "../adapters/timeout";

export function requestIdFor(request: Request): string {
  // Incoming X-Request-ID is never trusted. The entrypoint passes its ID explicitly.
  const ray = request.headers.get("Cf-Ray")?.trim();
  return ray && /^[A-Za-z0-9:-]{1,128}$/.test(ray) ? ray : crypto.randomUUID();
}

export function apiErrorResponse(status: number, code: string, message: string, requestId: string, headers?: HeadersInit): Response {
  const response = Response.json({ error: { code, message, requestId } } satisfies AdminErrorResponse, { status, headers });
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
  response.headers.set("X-Request-ID", requestId);
  return response;
}

/** Transitional boundary for resource handlers still returning string errors or empty 405s. */
export async function normalizeApiResponse(response: Response, requestId: string): Promise<Response> {
  if (response.ok) { response.headers.set("X-Request-ID", requestId); return response; }
  let payload: unknown;
  try { payload = await response.json(); } catch { /* Empty/non-JSON error responses use the status fallback. */ }
  const detail = readAdminError(payload);
  const legacy = payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string" ? payload.error : undefined;
  const headers = new Headers(response.headers);
  headers.delete("Content-Length");
  headers.delete("Content-Encoding");
  headers.delete("ETag");
  headers.delete("Content-Type");
  return apiErrorResponse(response.status, detail?.code ?? errorCodeForStatus(response.status),
    detail?.message ?? legacy ?? "Não foi possível concluir a operação.", requestId, headers);
}

class OperationError extends Error {
  readonly operation: string;
  constructor(operation: string, cause: unknown) {
    super("Administrative dependency failed.", { cause });
    this.operation = operation;
  }
}

export function errorCause(error: unknown): unknown { return error instanceof OperationError ? error.cause : error; }

export async function observeOperation<T>(operation: string, requestId: string, run: () => Promise<T>): Promise<T> {
  try { return await run(); }
  catch (cause) {
    const error = new OperationError(operation, cause);
    logApiFailure("admin.dependency.failed", requestId, error);
    throw error;
  }
}

export function isWriteConflict(error: FirestoreRestError): boolean {
  return error.operationType === "write" && ([409, 412].includes(error.status)
    || error.code === "FAILED_PRECONDITION" || error.code === "ABORTED");
}

export function operationalErrorResponse(error: unknown, requestId: string, dashboard = false): Response {
  const cause = errorCause(error);
  if (cause instanceof UpstreamTimeoutError) return apiErrorResponse(504, "UPSTREAM_TIMEOUT", "O serviço demorou mais que o esperado. Tente novamente.", requestId);
  if (cause instanceof FirestoreRestError) {
    if (isWriteConflict(cause)) return apiErrorResponse(412, "REVISION_MISMATCH", "O registro mudou. Recarregue e revise antes de tentar novamente.", requestId);
    if (cause.operationType === "read" && cause.status === 404) return apiErrorResponse(404, "NOT_FOUND", "Document not found.", requestId);
    if ([429, 503].includes(cause.status) || cause.code === "UNAVAILABLE" || cause.code === "RESOURCE_EXHAUSTED") {
      return apiErrorResponse(503, "SERVICE_UNAVAILABLE", "O serviço está temporariamente indisponível.", requestId);
    }
    if (cause.operationType === "query" || dashboard) return apiErrorResponse(500, "DATA_QUERY_FAILED",
      dashboard ? "Não foi possível carregar a visão geral." : "Não foi possível consultar os dados.", requestId);
  }
  return apiErrorResponse(500, "INTERNAL_ERROR", dashboard ? "Não foi possível carregar a visão geral." : "Não foi possível concluir a operação.", requestId);
}

/** Log only bounded provider diagnostics, never arbitrary messages, payloads, URLs or stack traces. */
export function logApiFailure(event: string, requestId: string, error: unknown): void {
  const cause = errorCause(error);
  let diagnostic: string | undefined;
  if (cause instanceof FirestoreRestError) {
    const message = cause.upstreamMessage ?? "";
    diagnostic = /query requires an index/i.test(message) ? "The query requires an index."
      : /index.*(building|not ready)/i.test(message) ? "The query index is not ready."
      : /invalid JSON payload/i.test(message) ? "Invalid JSON payload received."
      : "Firestore request rejected; arbitrary provider text omitted.";
  }
  console.error(JSON.stringify({ event, requestId,
    operation: error instanceof OperationError ? error.operation : cause instanceof FirestoreRestError ? `firestore.${cause.rpcMethod ?? "request"}` : undefined,
    service: cause instanceof FirestoreRestError ? "firestore" : undefined,
    upstreamHttpStatus: cause instanceof FirestoreRestError ? cause.status : undefined,
    upstreamCode: cause instanceof FirestoreRestError && /^[A-Z_]{1,64}$/.test(cause.code ?? "") ? cause.code : undefined,
    rpcMethod: cause instanceof FirestoreRestError ? cause.rpcMethod : undefined,
    collection: cause instanceof FirestoreRestError ? cause.collection : undefined,
    operationType: cause instanceof FirestoreRestError ? cause.operationType : undefined,
    diagnostic, errorType: cause instanceof UpstreamTimeoutError ? "UpstreamTimeoutError" : cause instanceof FirestoreRestError ? "FirestoreRestError" : "UnexpectedError",
  }));
}
