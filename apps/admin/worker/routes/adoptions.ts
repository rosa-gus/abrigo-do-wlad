import { z } from "zod";
import { adoptionStatusSchema, ADOPTION_DETAIL_FIELDS, ADOPTION_SUMMARY_FIELDS } from "@abrigo/contracts/adoptions";
import { documentId, selectFields } from "@abrigo/backend/application/errors";
import { jsonResponse, parseJson } from "@abrigo/backend/http/admin-request";
import { expectedRevision, withRevision } from "@abrigo/backend/http/revision";
import type { AdminRouteContext } from "./context";
const statusSchema = z.object({ status: adoptionStatusSchema });
export async function routeAdoptions({ request, route, services, identity }: AdminRouteContext): Promise<Response> {
  if (route.id === "adoptions") {
    const result = await services.adoptionReads.list(request);
    const page = Array.isArray(result) ? { items: result, nextCursor: null } : result;
    return jsonResponse(200, { items: page.items.map(item => selectFields(item, ADOPTION_SUMMARY_FIELDS)), nextCursor: page.nextCursor });
  }
  const id = documentId(route.params.id ?? "");
  if (route.id === "adoptionStatus") {
    const { status } = statusSchema.parse(await parseJson(request));
    const result = await services.adoptions.decide(id, status, expectedRevision(request));
    return withRevision(jsonResponse(200, result), result.revision);
  }
  await services.audit.record({ action: "adoption.detail.authorized", actor: identity.email, actorSubject: identity.subject,
    actorRole: identity.role, method: "GET", path: new URL(request.url).pathname,
    requestId: request.headers.get("X-Request-ID")!, target: `adoption_application/${id}`, outcome: "success", phase: "authorized", status: 200, durationMs: 0 });
  const adoption = selectFields(await services.adoptionReads.detail(id), ADOPTION_DETAIL_FIELDS);
  return withRevision(jsonResponse(200, adoption), typeof adoption.revision === "string" ? adoption.revision : undefined);
}
