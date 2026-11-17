import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTPayload,
} from "jose";

const ACCESS_ASSERTION_HEADER = "Cf-Access-Jwt-Assertion";
const ACCESS_DOMAIN_PATTERN = /^[a-z0-9-]+\.cloudflareaccess\.com$/i;

import type { AdminRole, AccessIdentity } from "@abrigo/contracts/admin";
export type { AdminRole, AccessIdentity } from "@abrigo/contracts/admin";

export type AccessEnv = Pick<
  Env,
  | "ADMIN_ADMINISTRATOR_EMAILS"
  | "ADMIN_DEVELOPER_EMAILS"
  | "CF_ACCESS_AUD"
  | "CF_ACCESS_TEAM_DOMAIN"
>;

export interface AccessDependencies {
  verifyJwt(token: string, env: AccessEnv): Promise<JWTPayload>;
}

export class AccessAuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AccessAuthenticationError";
  }
}

const remoteKeySets = new Map<
  string,
  ReturnType<typeof createRemoteJWKSet>
>();

function requireAccessEnv(env: AccessEnv, key: keyof AccessEnv): string {
  const rawValue = env[key];
  const value = typeof rawValue === "string" ? rawValue.trim() : "";

  if (!value) {
    throw new AccessAuthenticationError(`${key} is not configured.`);
  }

  return value;
}

function getRemoteKeySet(teamDomain: string) {
  const existing = remoteKeySets.get(teamDomain);
  if (existing) {
    return existing;
  }

  const keySet = createRemoteJWKSet(
    new URL(`https://${teamDomain}/cdn-cgi/access/certs`),
  );
  remoteKeySets.set(teamDomain, keySet);
  return keySet;
}

const productionDependencies: AccessDependencies = {
  async verifyJwt(token, env) {
    const teamDomain = requireAccessEnv(env, "CF_ACCESS_TEAM_DOMAIN").toLowerCase();
    const audience = requireAccessEnv(env, "CF_ACCESS_AUD");

    if (!ACCESS_DOMAIN_PATTERN.test(teamDomain)) {
      throw new AccessAuthenticationError(
        "CF_ACCESS_TEAM_DOMAIN must be a cloudflareaccess.com hostname.",
      );
    }

    const { payload } = await jwtVerify(token, getRemoteKeySet(teamDomain), {
      algorithms: ["RS256"],
      requiredClaims: ["exp", "iat", "iss", "aud", "sub", "email"],
      audience,
      issuer: `https://${teamDomain}`,
    });

    return payload;
  },
};

function parseEmailList(value: string): Set<string> {
  return new Set(
    value
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

function resolveRole(email: string, env: AccessEnv): AdminRole | null {
  const normalizedEmail = email.toLowerCase();
  const developerEmails = parseEmailList(
    requireAccessEnv(env, "ADMIN_DEVELOPER_EMAILS"),
  );
  const administratorEmails = parseEmailList(
    requireAccessEnv(env, "ADMIN_ADMINISTRATOR_EMAILS"),
  );

  if (developerEmails.has(normalizedEmail)) {
    return "developer";
  }

  if (administratorEmails.has(normalizedEmail)) {
    return "administrator";
  }

  return null;
}

export async function authenticateAccessRequest(
  request: Request,
  env: AccessEnv,
  dependencies: AccessDependencies = productionDependencies,
): Promise<AccessIdentity> {
  const assertion = request.headers.get(ACCESS_ASSERTION_HEADER)?.trim();

  if (!assertion) {
    throw new AccessAuthenticationError("Cloudflare Access assertion is missing.");
  }

  let payload: JWTPayload;
  try {
    payload = await dependencies.verifyJwt(assertion, env);
  } catch (error) {
    if (error instanceof AccessAuthenticationError) {
      throw error;
    }

    throw new AccessAuthenticationError("Cloudflare Access assertion is invalid.");
  }

  const email = typeof payload.email === "string" ? payload.email.trim() : "";
  const subject = typeof payload.sub === "string" ? payload.sub : "";
  const role = email ? resolveRole(email, env) : null;

  if (!email || !subject || !role) {
    throw new AccessAuthenticationError("Cloudflare Access identity is not authorized.");
  }

  return { email: email.toLowerCase(), role, subject };
}
