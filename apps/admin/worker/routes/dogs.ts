import { z } from "zod";
import { dogInputSchema, dogUpdateSchema } from "@abrigo/contracts/dogs";
import { ApplicationError } from "@abrigo/backend/application/errors";
import { jsonResponse, noContent, pageOptions, parseJson } from "@abrigo/backend/http/admin-request";
import { expectedRevision, withRevision } from "@abrigo/backend/http/revision";
import type { AdminRouteContext } from "./context";
const archiveSchema = z.object({ reason: z.enum(["adopted_via_site", "other"]) });
export async function routeDogs({ request, route, services, identity }: AdminRouteContext): Promise<Response> {
  const dogs = services.dogs;
  if (route.id === "identityInventory") return jsonResponse(200, await dogs.inventory());
  if (route.id === "dogs") {
    if (request.method === "GET") {
      const state = new URL(request.url).searchParams.get("state") ?? "active";
      if (state !== "active" && state !== "archived") throw new ApplicationError(400, "Invalid dog list state.");
      return jsonResponse(200, await dogs.list({ ...pageOptions(request), state }));
    }
    const result = await dogs.create(dogInputSchema.parse(await parseJson(request)));
    return withRevision(jsonResponse(201, result), result.revision);
  }
  let id: string;
  try { id = decodeURIComponent(route.params.id ?? ""); } catch { throw new ApplicationError(400, "Invalid dog ID."); }
  if (route.id === "dogArchive") {
    const input = archiveSchema.parse(await parseJson(request));
    return jsonResponse(200, await dogs.archive(id, input.reason, identity.email, expectedRevision(request)));
  }
  if (route.id === "dogRestore") return jsonResponse(200, await dogs.restore(id, expectedRevision(request)));
  if (request.method === "GET") {
    const value = await dogs.detail(id);
    return withRevision(jsonResponse(200, value), value.revision);
  }
  if (request.method === "PATCH") {
    const patch = dogUpdateSchema.parse(await parseJson(request));
    const result = await dogs.update(id, patch, expectedRevision(request, patch.expectedUpdateTime));
    return withRevision(jsonResponse(200, result), result.revision);
  }
  await dogs.delete(id, expectedRevision(request));
  return noContent();
}
