import type { AppServices } from "../composition";
import { availableDogMetadata, missingDogMetadata, rewriteDogPageMetadata, unavailableDogMetadata, unavailableServiceMetadata, type DogPageMetadata } from "@abrigo/backend/adapters/dogs/metadata";
import { dogProfilePath, isValidDogPublicSlug } from "@abrigo/backend/adapters/dogs/public-slug";

export function secureAssetResponse(response: Response): Response {
  const secured = new Response(response.body, response);
  secured.headers.set("Permissions-Policy", "camera=(), geolocation=(), microphone=()");
  secured.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  secured.headers.set("X-Content-Type-Options", "nosniff");
  secured.headers.set("X-Frame-Options", "DENY");
  return secured;
}

type DogPageRoute =
  | { kind: "slug"; publicSlug: string }
  | { kind: "invalid" };

export function dogPageRoute(pathname: string): DogPageRoute | null {
  if (!pathname.startsWith("/caes/")) return null;

  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 2) {
    return { kind: "slug", publicSlug: segments[1] ?? "" };
  }
  return { kind: "invalid" };
}

function responseWithStatus(response: Response, status: number): Response {
  return new Response(response.body, {
    status,
    headers: response.headers,
  });
}

async function renderDogPage(
  request: Request,
  services: AppServices,
  metadata: DogPageMetadata,
  status: number,
): Promise<Response> {
  const asset = await services.fetchAsset(request);
  const response = responseWithStatus(asset, status);
  response.headers.set("Cache-Control", "no-store");
  if (status >= 400) {
    response.headers.set("X-Robots-Tag", metadata.robots);
  }

  const contentType = response.headers.get("Content-Type") ?? "";
  const rendered = contentType.includes("text/html")
    ? rewriteDogPageMetadata(response, metadata)
    : response;
  return secureAssetResponse(rendered);
}

export async function handleDogPageRequest(
  request: Request,
  services: AppServices,
  route: DogPageRoute,
): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return secureAssetResponse(await services.fetchAsset(request));
  }

  if (
    route.kind === "invalid" ||
    (route.kind === "slug" && !isValidDogPublicSlug(route.publicSlug))
  ) {
    return renderDogPage(request, services, missingDogMetadata(), 404);
  }

  try {
    const profile = await services.resolveDogProfileBySlug(route.publicSlug);
    if (profile.state === "not_found") {
      return renderDogPage(request, services, missingDogMetadata(), 404);
    }

    const subject = profile.state === "available"
      ? profile.dog
      : profile.tombstone;
    const canonicalPath = dogProfilePath(subject.publicSlug);
    const requestUrl = new URL(request.url);
    if (requestUrl.pathname !== canonicalPath) {
      requestUrl.pathname = canonicalPath;
      return secureAssetResponse(Response.redirect(requestUrl, 308));
    }

    return profile.state === "available"
      ? renderDogPage(request, services, availableDogMetadata(profile.dog), 200)
      : renderDogPage(
        request,
        services,
        unavailableDogMetadata(profile.tombstone),
        410,
      );
  } catch (error) {
    console.error(JSON.stringify({
      event: "dogs.page.request.failed",
      publicSlug: route.kind === "slug" ? route.publicSlug : "invalid",
      message: error instanceof Error ? error.message : "Unknown failure",
    }));
    return renderDogPage(request, services, unavailableServiceMetadata(), 503);
  }
}

