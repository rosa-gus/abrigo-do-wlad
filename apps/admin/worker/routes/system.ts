import { systemSettingsSchema } from "@abrigo/contracts/system-settings";
import { notificationInputSchema } from "@abrigo/contracts/notifications";
import { jsonResponse, noContent, parseJson } from "@abrigo/backend/http/admin-request";
import { ABSENT_REVISION, expectedRevision, withRevision } from "@abrigo/backend/http/revision";
import type { AdminRouteContext } from "./context";
export async function routeSystem({ request, route, services }: AdminRouteContext): Promise<Response> {
  if (route.id === "settings") {
    const value = request.method === "GET" ? await services.settings.get()
      : await services.settings.save(systemSettingsSchema.parse(await parseJson(request)), expectedRevision(request));
    return withRevision(jsonResponse(200, value), value.revision === ABSENT_REVISION ? undefined : value.revision);
  }
  if (route.id === "auditLog") return jsonResponse(200, await services.audit.list());
  if (route.id === "systemKeys") {
    const state = await services.keys.state();
    return withRevision(jsonResponse(200, state.value), state.revision);
  }
  if (route.id === "rotateKey") return jsonResponse(201, await services.keys.rotate(expectedRevision(request)));
  if (route.id !== "notifications") return jsonResponse(404, { error: "Not found" });
  if (request.method === "GET") {
    const state = await services.notifications.state();
    return withRevision(jsonResponse(200, state.value), state.revision);
  }
  if (request.method === "PUT") return jsonResponse(200, await services.notifications.save(notificationInputSchema.parse(await parseJson(request)), expectedRevision(request)));
  await services.notifications.delete(expectedRevision(request));
  return noContent();
}
