import crypto from "crypto";
import net from "net";
import type { IncomingMessage } from "http";
import { getKvStore } from "./kv";
import {
  getAllowedOrigins,
  RATE_LIMIT_WINDOW,
  MAX_REQUESTS_PER_WINDOW,
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
  const forwardedFor = getHeaderValue(req.headers, "x-forwarded-for");
  const clientIp =
    forwardedFor?.split(",")[0].trim() ||
    ("socket" in req ? req.socket.remoteAddress : undefined) ||
    "unknown";

  if (clientIp === "unknown") return clientIp;

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
  if (clientIp === "unknown") return true;

  const key = `rate-limit:${clientIp}`;
  const kvStore = getKvStore(env);

  try {
    const current = await kvStore.incr(key);

    if (current === 1) {
      await kvStore.expire(key, RATE_LIMIT_WINDOW);
    }

    return current <= MAX_REQUESTS_PER_WINDOW;
  } catch (err) {
    console.error("Error checking rate limit:", err);
    return true;
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

    const response = await fetcher(
      "https://www.google.com/recaptcha/api/siteverify",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      },
    );

    if (!response.ok) {
      console.error("reCAPTCHA validation failed: Unexpected response status.");
      return false;
    }

    const data = (await response.json()) as {
      success: boolean;
      score?: number;
      action?: string;
      hostname?: string;
      "error-codes"?: string[];
    };

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
