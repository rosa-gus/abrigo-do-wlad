import { readJsonBodyWithLimit, RequestBodyTooLargeError } from "./body";
import { ApplicationError } from "../application/errors";
import type { PageInput } from "../ports/documents";

export function jsonResponse(status: number, body: unknown): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'", "X-Content-Type-Options": "nosniff" } });
}
export function methodNotAllowed(allowed: string[]): Response {
  return new Response(null, { status: 405, headers: { Allow: allowed.join(", "), "Cache-Control": "no-store" } });
}
export function assertSameOrigin(request: Request): void {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return;
  const origin = request.headers.get("Origin");
  if (!origin || origin !== new URL(request.url).origin) throw new ApplicationError(403, "Cross-origin state change rejected.");
}
export async function parseJson(request: Request): Promise<unknown> {
  if (!request.headers.get("Content-Type")?.toLowerCase().startsWith("application/json")) throw new ApplicationError(415, "Content-Type must be application/json.");
  const limit = 256 * 1024;
  const declaredLength = Number(request.headers.get("Content-Length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > limit) throw new ApplicationError(413, "Request body is too large.");
  try { return await readJsonBodyWithLimit(request, limit); }
  catch (error) {
    if (error instanceof RequestBodyTooLargeError) throw new ApplicationError(413, "Request body is too large.");
    throw new ApplicationError(400, "Request body is not valid JSON.");
  }
}
export function pageOptions(request?: Request): PageInput {
  const params = request ? new URL(request.url).searchParams : new URLSearchParams();
  const rawLimit = params.get("limit");
  const limit = rawLimit === null ? 25 : Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || (rawLimit !== null && !/^[1-9][0-9]*$/.test(rawLimit))) throw new ApplicationError(400, "Page size must be between 1 and 100.");
  const publication = params.get("publicationStatus");
  if (publication && publication !== "draft" && publication !== "published") throw new ApplicationError(400, "Invalid publication filter.");
  return { limit, cursor: params.get("cursor") ?? undefined, publication: publication as PageInput["publication"] };
}
export function adoptionPageOptions(request?: Request) {
  const status = request ? new URL(request.url).searchParams.get("status") : null;
  if (status && !["pending", "approved", "rejected"].includes(status)) throw new ApplicationError(400, "Invalid adoption status filter.");
  return { ...pageOptions(request), status };
}
export function noContent(): Response { return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } }); }
