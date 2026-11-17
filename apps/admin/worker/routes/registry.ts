import type { AdminAuditAction, AdminAuditEventInput } from "@abrigo/contracts/audit";
import type { AdminCapability } from "@abrigo/domain/admin/policies";

type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
type RouteOperation = {
  capability: AdminCapability;
  audit?: { action: AdminAuditAction; target: string };
};
function operation(capability: AdminCapability, action?: AdminAuditAction, target?: string): RouteOperation {
  return { capability, ...(action && target ? { audit: { action, target } } : {}) };
}

/** Exact paths are the shared source for dispatch, authorization, audit and log labels. */
export const ADMIN_ROUTES = [
  { id: "session", path: "/api/session", methods: { GET: operation("session.read") } },
  { id: "dashboard", path: "/api/admin/dashboard", methods: { GET: operation("content.read") } },
  { id: "adoptions", path: "/api/admin/adoptions", methods: { GET: operation("adoptions.read") } },
  { id: "adoption", path: "/api/admin/adoptions/:id", methods: { GET: operation("adoptions.read") } },
  { id: "adoptionStatus", path: "/api/admin/adoptions/:id/status", methods: { PATCH: operation("adoptions.decide", "adoption.status.updated", "adoption_application/:id") } },
  { id: "dogs", path: "/api/admin/dogs", methods: { GET: operation("content.read"), POST: operation("content.manage", "dog.created", "dogs") } },
  { id: "dog", path: "/api/admin/dogs/:id", methods: { GET: operation("content.read"), PATCH: operation("content.manage", "dog.updated", "dogs/:id"), DELETE: operation("content.manage", "dog.deleted", "dogs/:id") } },
  { id: "dogArchive", path: "/api/admin/dogs/:id/archive", methods: { POST: operation("content.manage", "dog.archived", "dogs/:id") } },
  { id: "dogRestore", path: "/api/admin/dogs/:id/restore", methods: { POST: operation("content.manage", "dog.restored", "dogs/:id") } },
  { id: "recyclePoints", path: "/api/admin/recycle-points", methods: { GET: operation("content.read"), POST: operation("content.manage", "recycle-point.created", "recycle_points") } },
  { id: "recyclePoint", path: "/api/admin/recycle-points/:id", methods: { GET: operation("content.read"), PATCH: operation("content.manage", "recycle-point.updated", "recycle_points/:id"), DELETE: operation("content.manage", "recycle-point.deleted", "recycle_points/:id") } },
  { id: "settings", path: "/api/admin/system/settings", methods: { GET: operation("content.read"), PATCH: operation("availability.manage", "adoption.availability.updated", "system/settings") } },
  { id: "identityInventory", path: "/api/admin/dog-identity-inventory", methods: { GET: operation("identity.inspect") } },
  { id: "auditLog", path: "/api/admin/audit-log", methods: { GET: operation("audit.read") } },
  { id: "systemKeys", path: "/api/admin/system-keys", methods: { GET: operation("keys.manage") } },
  { id: "rotateKey", path: "/api/admin/system-keys/rotate", methods: { POST: operation("keys.manage", "system-key.rotated", "system/keys") } },
  { id: "notifications", path: "/api/admin/notifications", methods: { GET: operation("notifications.read"), PUT: operation("notifications.manage", "notification.saved", "system/notifications"), DELETE: operation("notifications.manage", "notification.deleted", "system/notifications") } },
  { id: "migrations", path: "/api/admin/migrations", methods: { GET: operation("migrations.manage") } },
  { id: "migrationPlan", path: "/api/admin/migrations/plan", methods: { POST: operation("migrations.manage") } },
  { id: "migrationApply", path: "/api/admin/migrations/apply", methods: { POST: operation("migrations.manage", "migration.batch.applied", "_migrations") } },
  { id: "mediaUpload", path: "/api/admin/media/upload", methods: { POST: operation("media.manage", "media.uploaded", "cloudinary/dogs") } },
  { id: "mediaDelete", path: "/api/admin/media/delete", methods: { POST: operation("media.manage", "media.deleted", "cloudinary/dogs") } },
] as const;

type Definition = typeof ADMIN_ROUTES[number];
export interface AdminRouteMatch {
  id: Definition["id"];
  path: Definition["path"];
  params: { id?: string };
  methods: Readonly<Partial<Record<Method, RouteOperation>>>;
}

const routeMatchers = ADMIN_ROUTES.map(route => ({
  route,
  pattern: new RegExp(`^${route.path.replace(":id", "([^/]+)")}$`),
}));

export function matchAdminRoute(pathname: string): AdminRouteMatch | null {
  for (const { route, pattern } of routeMatchers) {
    const match = pattern.exec(pathname);
    if (match) return { ...route, params: match[1] ? { id: match[1] } : {} };
  }
  return null;
}

export function adminRouteOperation(route: AdminRouteMatch, method: string): RouteOperation | undefined {
  return Object.hasOwn(route.methods, method) ? route.methods[method as Method] : undefined;
}

function safeAuditId(value?: string): string {
  if (!value) return "invalid";
  try {
    const decoded = decodeURIComponent(value);
    const id = decoded.startsWith("doc:") ? decoded.slice(4) : decoded;
    return /^[A-Za-z0-9_-]{1,128}$/.test(id) ? id : "invalid";
  } catch { return "invalid"; }
}

export function describeAdminMutation(request: Request): {
  action: AdminAuditAction; method: AdminAuditEventInput["method"]; target: string;
} | null {
  const route = matchAdminRoute(new URL(request.url).pathname);
  const audit = route && adminRouteOperation(route, request.method)?.audit;
  if (!audit) return null;
  return { action: audit.action, method: request.method as AdminAuditEventInput["method"],
    target: audit.target.replace(":id", safeAuditId(route.params.id)) };
}
