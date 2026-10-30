import { HTTP_STATUS, MAX_REQUEST_SIZE, RATE_LIMIT_WINDOW } from "./constants";
import {
  getClientIp,
  checkRateLimit,
  RateLimitUnavailableError,
  validateOrigin,
  validateContentType,
  validateRequestSize,
} from "./security";
import { sendError } from "./response";
import type { CloudflareEnv } from "./env";

export class RequestBodyTooLargeError extends Error {
  constructor() {
    super("Request body exceeds the configured size limit.");
    this.name = "RequestBodyTooLargeError";
  }
}

export async function readJsonBodyWithLimit(
  request: Request,
  maxBytes = MAX_REQUEST_SIZE,
): Promise<unknown> {
  if (!request.body) {
    return JSON.parse("") as unknown;
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      totalBytes += value.byteLength;

      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new RequestBodyTooLargeError();
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;

  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return JSON.parse(new TextDecoder().decode(body)) as unknown;
}

export async function validateRequest(
  req: Request,
  options?: {
    requireAuth?: boolean;
    expectedMethod?: string;
    skipRateLimit?: boolean;
    validateOrigin?: boolean;
    validateContentType?: boolean;
    validateRequestSize?: boolean;
  },
  env?: CloudflareEnv,
): Promise<Response | null> {
  const method = options?.expectedMethod || "POST";
  const shouldValidateBody = ["POST", "PUT", "PATCH"].includes(method);
  const shouldValidateOrigin = options?.validateOrigin ?? true;
  const shouldValidateContentType =
    options?.validateContentType ?? shouldValidateBody;
  const shouldValidateRequestSize =
    options?.validateRequestSize ?? shouldValidateBody;

  if (req.method !== method) {
    return sendError(HTTP_STATUS.METHOD_NOT_ALLOWED, "Method not allowed");
  }

  const clientIp = getClientIp(req);

  if (!options?.skipRateLimit) {
    try {
      const isAllowed = await checkRateLimit(clientIp, env);
      if (!isAllowed) {
        const response = sendError(HTTP_STATUS.TOO_MANY_REQUESTS, "Muitas tentativas de envio. Aguarde um minuto e tente novamente.");
        response.headers.set("Retry-After", String(RATE_LIMIT_WINDOW));
        return response;
      }
    } catch (error) {
      if (error instanceof RateLimitUnavailableError) {
        return sendError(HTTP_STATUS.SERVICE_UNAVAILABLE, error.message);
      }
      throw error;
    }
  }

  const contentLength = req.headers.get("content-length") ?? undefined;

  if (
    shouldValidateRequestSize &&
    contentLength !== undefined &&
    !validateRequestSize(contentLength)
  ) {
    return sendError(HTTP_STATUS.PAYLOAD_TOO_LARGE, "Request entity too large");
  }

  if (shouldValidateOrigin && !validateOrigin(req, env)) {
    return sendError(HTTP_STATUS.FORBIDDEN, "Forbidden: Invalid origin");
  }

  if (shouldValidateContentType && !validateContentType(req)) {
    return sendError(HTTP_STATUS.BAD_REQUEST, "Invalid Content-Type");
  }

  return null;
}
