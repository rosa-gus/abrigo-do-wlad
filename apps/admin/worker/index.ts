import {
  AccessAuthenticationError,
  authenticateAccessRequest,
  type AccessIdentity,
} from "./access";
import { handleAdminApi as handleAuthenticatedAdminApi } from "./admin-api";

const NO_INDEX_POLICY = "noindex, nofollow, noarchive, nosnippet";

type AssetAuthenticator = (request: Request, env: Env) => Promise<AccessIdentity>;

function jsonResponse(status: number, body: unknown): Response {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": NO_INDEX_POLICY,
    },
  });
}

export function secureAssetResponse(response: Response): Response {
  const secured = new Response(response.body, response);
  secured.headers.set(
    "Content-Security-Policy",
    "default-src 'self'; base-uri 'none'; connect-src 'self'; font-src 'self' https://fonts.gstatic.com; form-action 'self'; frame-ancestors 'none'; img-src 'self' blob: data: https://res.cloudinary.com; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  );
  secured.headers.set("Permissions-Policy", "camera=(), geolocation=(), microphone=()");
  secured.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  secured.headers.set("X-Content-Type-Options", "nosniff");
  secured.headers.set("X-Frame-Options", "DENY");
  secured.headers.set("X-Robots-Tag", NO_INDEX_POLICY);
  return secured;
}

function unauthorizedResponse(error: unknown): Response {
  const message =
    error instanceof AccessAuthenticationError
      ? error.message
      : "Unexpected authentication failure.";
  console.error(
    JSON.stringify({ event: "admin.access.denied", reason: message }),
  );
  return jsonResponse(401, { error: "Unauthorized" });
}

export async function handleAdminAsset(
  request: Request,
  env: Env,
  authenticate: AssetAuthenticator = authenticateAccessRequest,
): Promise<Response> {
  try {
    await authenticate(request, env);
  } catch (error) {
    return unauthorizedResponse(error);
  }

  return secureAssetResponse(await env.ASSETS.fetch(request));
}

export async function handleAdminApi(
  request: Request,
  env: Env,
  executionContext?: Pick<ExecutionContext, "waitUntil">,
  authenticate: AssetAuthenticator = authenticateAccessRequest,
): Promise<Response> {
  const url = new URL(request.url);

  if (url.pathname === "/api/session" && request.method !== "GET") {
    return new Response(null, {
      status: 405,
      headers: {
        Allow: "GET",
        "Cache-Control": "no-store",
        "X-Robots-Tag": NO_INDEX_POLICY,
      },
    });
  }

  try {
    const identity = await authenticate(request, env);
    if (url.pathname === "/api/session") {
      return jsonResponse(200, {
        email: identity.email,
        role: identity.role,
      });
    }
    return handleAuthenticatedAdminApi(
      request,
      env,
      identity,
      undefined,
      executionContext,
    );
  } catch (error) {
    return unauthorizedResponse(error);
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: Pick<ExecutionContext, "waitUntil">): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      return handleAdminApi(request, env, ctx);
    }

    return handleAdminAsset(request, env);
  },
} satisfies ExportedHandler<Env>;
