import type { CloudflareEnv } from "./env";
import { getEnvValue } from "./env";

export const MAX_REQUEST_SIZE = 50 * 1024; // 50KB
export const RATE_LIMIT_WINDOW = 60; // segundos
export const MAX_REQUESTS_PER_WINDOW = 5;
export { ADOPTION_EXPIRATION_DAYS } from "../adoption/retention";

export function getAllowedOrigins(env?: CloudflareEnv): string[] {
  const origin = getEnvValue(env, "ALLOWED_ORIGIN", "http://localhost:5173");
  return origin ? [origin] : ["http://localhost:5173"];
}

export const ALLOWED_ORIGINS = getAllowedOrigins();

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  PAYLOAD_TOO_LARGE: 413,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;
