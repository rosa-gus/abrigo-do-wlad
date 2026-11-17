import { z } from "zod";
import { jsonResponse, parseJson } from "@abrigo/backend/http/admin-request";
import type { AdminRouteContext } from "./context";
const deleteSchema = z.object({ imageUrl: z.string().url().refine(value => value.startsWith("https://")) });
export async function routeMedia({ request, route, services }: AdminRouteContext): Promise<Response> {
  if (route.id === "mediaUpload") {
    if (!await services.media.allowed()) {
      const response = jsonResponse(429, { error: "Limite de uploads excedido. Aguarde um minuto." });
      response.headers.set("Retry-After", "60"); return response;
    }
    return jsonResponse(201, await services.media.upload(request));
  }
  const { imageUrl } = deleteSchema.parse(await parseJson(request));
  await services.media.delete(imageUrl);
  return jsonResponse(200, { ok: true });
}
