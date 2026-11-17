import { HTTP_STATUS, RATE_LIMIT_WINDOW } from "./constants";
import {
  getClientIp,
  checkRateLimit,
  RateLimitUnavailableError,
  validateOrigin,
  validateContentType,
  validateRequestSize,
} from "../adapters/security";
import { sendError } from "./response";
import type { CloudflareEnv } from "../adapters/env";

export { RequestBodyTooLargeError, readBodyBytesWithLimit, readJsonBodyWithLimit } from "./body";

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
