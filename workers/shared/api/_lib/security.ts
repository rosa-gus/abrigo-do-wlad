import { withUpstreamTimeout, UpstreamTimeoutError } from "./timeout";
import crypto from "crypto";
import net from "net";
import type { IncomingMessage } from "http";
import {
  getAllowedOrigins,
  MAX_REQUEST_SIZE,
} from "./constants";
import { getEnvValue, type CloudflareEnv } from "./env";

function getHeaderValue(
  headers: Headers | Record<string, string | string[] | undefined>,
  key: string,
): string | undefined {
  if (headers instanceof Headers) {
    return headers.get(key) ?? undefined;
  }

  const value = headers[key];
  return Array.isArray(value) ? value[0] : value ?? undefined;
}

export function getClientIp(req: Request | IncomingMessage): string {
  // Cloudflare supplies this header; the first forwarded-for value is client-controlled.
  const clientIp =
    getHeaderValue(req.headers, "cf-connecting-ip")?.trim() ||
    ("socket" in req ? req.socket.remoteAddress : undefined) ||
    "unknown";

  if (!net.isIP(clientIp)) return "unknown";

  return truncateIp(clientIp);
}

function normalizeIpv6(ip: string): string[] | null {
  const [head, tail] = ip.split("::");
  const headParts = head ? head.split(":").filter(Boolean) : [];
  const tailParts = tail ? tail.split(":").filter(Boolean) : [];
  const missing = 8 - (headParts.length + tailParts.length);

  if (missing < 0) return null;

  const parts = [
    ...headParts,
    ...Array.from({ length: missing }, () => "0"),
    ...tailParts,
  ];

  return parts.length === 8 ? parts : null;
}

function truncateIp(ip: string): string {
  const ipType = net.isIP(ip);

  if (ipType === 4) {
    const parts = ip.split(".");
    if (parts.length !== 4) return ip;
    return `${parts[0]}.${parts[1]}.${parts[2]}.0`;
  }

  if (ipType === 6) {
    const parts = normalizeIpv6(ip);
    if (!parts) return ip;
    return `${parts.slice(0, 4).join(":")}::`;
  }

  return ip;
}

export async function checkRateLimit(
  clientIp: string,
  env?: CloudflareEnv,
): Promise<boolean> {
  // Local requests may not pass through Cloudflare's edge headers.
  if (clientIp === "unknown" && getEnvValue(env, "APP_ENV") === "local") return true;
  try {
    if (clientIp === "unknown" || !env?.ADOPTION_RATE_LIMITER) {
      throw new Error("Rate limiting is unavailable.");
    }
    const { success } = await env.ADOPTION_RATE_LIMITER.limit({ key: `adoption:${clientIp}` });
    return success;
  } catch (err) {
    console.error("Error checking rate limit:", err);
    throw new RateLimitUnavailableError();
  }
}

export class RateLimitUnavailableError extends Error {
  constructor() {
    super("A proteção de envio está temporariamente indisponível. Tente novamente mais tarde.");
    this.name = "RateLimitUnavailableError";
  }
}

export function validateOrigin(
  req: Request | IncomingMessage,
  env?: CloudflareEnv,
): boolean {
  const originOrReferer =
    getHeaderValue(req.headers, "origin") ??
    getHeaderValue(req.headers, "referer");

  if (!originOrReferer) return false;

  try {
    const requestOrigin = new URL(originOrReferer).origin;

    return getAllowedOrigins(env).some((allowed) => {
      try {
        return new URL(allowed).origin === requestOrigin;
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}

export function validateContentType(req: Request | IncomingMessage): boolean {
  const contentType = getHeaderValue(req.headers, "content-type");
  return contentType?.includes("application/json") ?? false;
}

export function validateRequestSize(
  contentLength: string | undefined,
): boolean {
  if (!contentLength) return false;

  const parsedLength = Number(contentLength);
  return (
    Number.isSafeInteger(parsedLength) &&
    parsedLength >= 0 &&
    parsedLength <= MAX_REQUEST_SIZE
  );
}

export function validateAuthHeader(
  authHeader: string | undefined,
  expectedToken: string,
): boolean {
  if (!authHeader || !expectedToken.trim()) {
    return false;
  }

  const expected = `Bearer ${expectedToken}`;

  if (authHeader.length !== expected.length) {
    return false;
  }

  return crypto.timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected));
}

export async function verifyRecaptcha(
  token: string,
  env?: CloudflareEnv,
  options?: {
    expectedAction?: string;
    expectedHostname?: string;
    minimumScore?: number;
    fetcher?: typeof fetch;
  },
): Promise<boolean> {
  if (!token || typeof token !== "string" || token.length > 5000) {
    console.error(
      "reCAPTCHA validation failed: Invalid token format or length.",
    );
    return false;
  }

  const secret = getEnvValue(env, "RECAPTCHA_SECRET_KEY");
  if (!secret) {
    console.error("reCAPTCHA validation failed: Missing secret key.");
    return false;
  }

  try {
    const fetcher = options?.fetcher ?? fetch;
    const params = new URLSearchParams({
      secret,
      response: token,
    });

    const data = await withUpstreamTimeout(async (signal) => {
      const response = await fetcher(
        "https://www.google.com/recaptcha/api/siteverify",
        {
          signal,
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: params.toString(),
        },
      );

      if (!response.ok) {
        console.error("reCAPTCHA validation failed: Unexpected response status.");
        throw new Error("Unexpected verification status");
      }

      const data = (await response.json()) as {
        success: boolean;
        score?: number;
        action?: string;
        hostname?: string;
        "error-codes"?: string[];
      };

      return data;
    }, "A verificação de segurança");

    if (getEnvValue(env, "APP_ENV") === "local") {
      console.log("reCAPTCHA Google Response:", data);
    }

    const minimumScore = options?.minimumScore ?? 0.5;
    const expectedHostname = options?.expectedHostname?.toLowerCase();

    return (
      data.success &&
      typeof data.score === "number" &&
      data.score >= minimumScore &&
      (!options?.expectedAction || data.action === options.expectedAction) &&
      (!expectedHostname || data.hostname?.toLowerCase() === expectedHostname)
    );
  } catch (err) {
    console.error("Error verifying reCAPTCHA:", err);
    if (err instanceof UpstreamTimeoutError) throw err;
    return false;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function stripScriptTags(value: string): string {
  return value.replace(/<\s*\/\s*script[^>]*>/gi, "");
}

function sanitizeValue(value: unknown): unknown {
  if (typeof value === "string") {
    const stripped = stripScriptTags(value);
    return escapeHtml(stripped);
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item));
  }

  if (value && typeof value === "object") {
    const sanitized: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      sanitized[key] = sanitizeValue(nested);
    }
    return sanitized;
  }

  return value;
}

export function sanitizeFormFields<T>(data: T): T {
  return sanitizeValue(data) as T;
}
