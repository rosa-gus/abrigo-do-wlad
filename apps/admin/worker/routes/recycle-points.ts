import { recyclePointInputSchema, recyclePointUpdateSchema } from "@abrigo/contracts/recycle-points";
import { jsonResponse, noContent, pageOptions, parseJson } from "@abrigo/backend/http/admin-request";
import { expectedRevision, withRevision } from "@abrigo/backend/http/revision";
import type { AdminRouteContext } from "./context";
export async function routeRecycle({ request, route, services }: AdminRouteContext): Promise<Response> {
  const recycle = services.recycle;
  if (route.id === "recyclePoints") {
    if (request.method === "GET") return jsonResponse(200, await recycle.list(pageOptions(request)));
    return jsonResponse(201, await recycle.create(recyclePointInputSchema.parse(await parseJson(request))));
  }
  const id = route.params.id ?? "";
  if (request.method === "GET") {
    const value = await recycle.detail(id);
    return withRevision(jsonResponse(200, value), value.revision);
  }
  if (request.method === "PATCH") {
    const patch = recyclePointUpdateSchema.parse(await parseJson(request));
    return jsonResponse(200, await recycle.update(id, patch, expectedRevision(request, patch.expectedUpdateTime)));
  }
  await recycle.delete(id, expectedRevision(request));
  return noContent();
}
