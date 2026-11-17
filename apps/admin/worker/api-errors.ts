export * from "@abrigo/backend/http/admin-errors";
import { matchAdminRoute } from "./routes/registry";
/** Logs and dispatch share the exact route registry; IDs never become labels. */
export function requestRouteForLog(request: Request): string {
  return matchAdminRoute(new URL(request.url).pathname)?.path ?? "/api/unknown";
}
