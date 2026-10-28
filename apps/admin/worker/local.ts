import { AccessAuthenticationError, type AccessIdentity } from "./access";
import { handleAdminApi, handleAdminAsset } from "./index";

declare const __ADMIN_LOCAL_WORKER__: boolean;
declare const __ADMIN_LOCAL_ROLE__: string;

const DEVELOPMENT_PROJECT = "abrigo-do-wlad-dev";
const LOCAL_HOSTS = new Set(["127.0.0.1:5174", "localhost:5174"]);

// This entry is selected only by Vite dev. Raw Wrangler cannot enable it through bindings.
export async function authenticateLocalRequest(request: Request, env: Env): Promise<AccessIdentity> {
  if (typeof __ADMIN_LOCAL_WORKER__ === "undefined" || __ADMIN_LOCAL_WORKER__ !== true) {
    throw new AccessAuthenticationError("Local admin is unavailable outside the development server.");
  }
  if (env.APP_ENV !== "local") {
    throw new AccessAuthenticationError("Local admin requires APP_ENV=local.");
  }
  if (env.FIREBASE_PROJECT_ID !== DEVELOPMENT_PROJECT) {
    throw new AccessAuthenticationError(`Local admin requires Firebase project ${DEVELOPMENT_PROJECT}; received ${env.FIREBASE_PROJECT_ID ?? "unset"}.`);
  }
  if (!env.FIREBASE_CLIENT_EMAIL?.endsWith(`@${DEVELOPMENT_PROJECT}.iam.gserviceaccount.com`)) {
    throw new AccessAuthenticationError("Local admin requires a service account from the development project.");
  }
  const url = new URL(request.url);
  const host = request.headers.get("Host");
  const origin = request.headers.get("Origin");
  const connectingIp = request.headers.get("CF-Connecting-IP");
  if (
    url.protocol !== "http:" || !LOCAL_HOSTS.has(url.host) ||
    (host !== null && host !== url.host) ||
    (origin !== null && origin !== url.origin) ||
    request.headers.has("Forwarded") ||
    (request.headers.has("X-Forwarded-Host") && request.headers.get("X-Forwarded-Host") !== url.host) ||
    (connectingIp !== null && connectingIp !== "127.0.0.1" && connectingIp !== "::1")
  ) {
    throw new AccessAuthenticationError("Local admin accepts loopback requests only.");
  }
  if (typeof __ADMIN_LOCAL_ROLE__ === "undefined" || (
    __ADMIN_LOCAL_ROLE__ !== "administrator" && __ADMIN_LOCAL_ROLE__ !== "developer"
  )) {
    throw new AccessAuthenticationError("Local admin role is invalid.");
  }
  const role = __ADMIN_LOCAL_ROLE__;
  return {
    email: `local-${role}@example.test`,
    role,
    subject: `local-${role}`,
  };
}

export default {
  async fetch(request: Request, env: Env, ctx: Pick<ExecutionContext, "waitUntil">): Promise<Response> {
    if (new URL(request.url).pathname.startsWith("/api/")) {
      return handleAdminApi(request, env, ctx, authenticateLocalRequest);
    }
    return handleAdminAsset(request, env, authenticateLocalRequest);
  },
} satisfies ExportedHandler<Env>;
