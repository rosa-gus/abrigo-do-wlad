import { jsonResponse } from "@abrigo/backend/adapters/env";
import type { AppServices } from "../composition";
export async function handleApiRequest(request: Request, services: AppServices): Promise<Response> {
  const path = new URL(request.url).pathname;
  if (path === "/api/recycle-points" || path === "/api/system/settings") return services.publicData(request);
  if (path === "/api/hero-dog") return services.heroDog(request);
  if (path === "/api/dogs") return services.dogFeed(request);
  const profile = path.match(/^\/api\/dogs\/by-slug\/([^/]+)$/);
  if (profile) return services.dogProfile(request, profile[1]);
  if (path === "/api/adoption/create") return services.createAdoption(request);
  if (path === "/api/tests/email" && services.local) return services.debugEmail(request);
  return jsonResponse(404, { message: "Route not found." });
}
