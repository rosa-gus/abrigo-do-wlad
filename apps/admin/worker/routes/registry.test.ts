import { describe, expect, test, vi } from "vitest";
import { handleAdminApi } from "../admin-api";
import { requestRouteForLog } from "../api-errors";
import { hasAdminCapability } from "../policies";
import { ADMIN_ROUTES, adminRouteOperation, describeAdminMutation, matchAdminRoute } from "./registry";

const origin = "https://admin.example.test";
const administrator = { role: "administrator", email: "admin@example.test", subject: "admin-subject" } as const;
const developer = { ...administrator, role: "developer" } as const;

function request(path: string, method = "GET") {
  return new Request(`${origin}${path}`, { method, headers: { Origin: origin } });
}

describe("exact administrative routes", () => {
  test.each([
    "/api/other/dogs", "/api/other/recycle-points/id", "/api/other/adoptions/id",
    "/api/other/adoptions/id/status", "/api/admin//dogs", "/api//admin/dogs",
    "/api/admin/dogs/", "/api/admin/dogs/id/", "/api/admin/dogs/id/unknown",
    "/api/admin/dogs/id/archive/extra", "/api/admin/migrations/unknown", "/api/admin/media/unknown",
  ])("rejects aliases and unknown path %s without dependencies", async path => {
    expect(matchAdminRoute(path)).toBeNull();
    expect(requestRouteForLog(request(path))).toBe("/api/unknown");
    const dependencies = new Proxy({}, { get() { throw new Error("Unknown routes must not access dependencies"); } });
    const response = await handleAdminApi(request(path), {} as Env, administrator, dependencies as never);
    expect(response.status).toBe(404);
    expect(describeAdminMutation(request(path, "PATCH"))).toBeNull();
  });

  test.each(ADMIN_ROUTES.filter(route => route.id !== "session"))("rejects unsupported methods for $path before I/O", async definition => {
    const path = definition.path.replace(":id", "synthetic");
    const dependencies = new Proxy({}, { get() { throw new Error("Invalid methods must not access dependencies"); } });
    const response = await handleAdminApi(request(path, "OPTIONS"), {} as Env, developer, dependencies as never);
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe(Object.keys(definition.methods).join(", "));
    expect(describeAdminMutation(request(path, "OPTIONS"))).toBeNull();
  });

  test.each(ADMIN_ROUTES)("shares matching and bounded log labels for $path", definition => {
    const path = definition.path.replace(":id", "private-id");
    const route = matchAdminRoute(path)!;
    expect(route.id).toBe(definition.id);
    expect(requestRouteForLog(request(path))).toBe(definition.path);
    for (const [method, operation] of Object.entries(definition.methods)) {
      expect(adminRouteOperation(route, method)).toEqual(operation);
      expect(hasAdminCapability("developer", operation.capability)).toBe(true);
      const technical = ["notifications.manage", "keys.manage", "audit.read", "migrations.manage", "identity.inspect"].includes(operation.capability);
      expect(hasAdminCapability("administrator", operation.capability)).toBe(!technical);
      const descriptor = describeAdminMutation(request(path, method));
      expect(descriptor?.action).toBe(operation.audit?.action);
      expect(descriptor?.target).toBe(operation.audit?.target.replace(":id", "private-id"));
    }
  });

  test.each(["constructor", "toString", "__proto__"])("rejects arbitrary HTTP method %s with 405", async method => {
    const dependencies = new Proxy({}, { get() { throw new Error("Invalid methods must not access dependencies"); } });
    const response = await handleAdminApi(request("/api/admin/dogs", method), {} as Env, administrator, dependencies as never);
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("GET, POST");
  });

  test("dynamic canonical detail invokes its dependencies and audits authorized access", async () => {
    const getAdoptionApplication = vi.fn().mockResolvedValue({ id: "synthetic" });
    const recordAdminAuditEvent = vi.fn().mockResolvedValue(undefined);
    const response = await handleAdminApi(request("/api/admin/adoptions/synthetic"), {} as Env, administrator,
      { getAdoptionApplication, recordAdminAuditEvent } as never);
    expect(response.status).toBe(200);
    expect(getAdoptionApplication).toHaveBeenCalledExactlyOnceWith({}, "synthetic");
    expect(recordAdminAuditEvent).toHaveBeenCalledWith({}, expect.objectContaining({ action: "adoption.detail.authorized", target: "adoption_application/synthetic" }));
  });

  test("audit targets preserve canonical document IDs and sanitize invalid IDs", () => {
    expect(describeAdminMutation(request("/api/admin/dogs/doc%3Amy-dog", "PATCH"))?.target).toBe("dogs/my-dog");
    expect(describeAdminMutation(request("/api/admin/dogs/invalid%2Fid", "PATCH"))?.target).toBe("dogs/invalid");
    expect(adminRouteOperation(matchAdminRoute("/api/admin/dogs")!, "toString")).toBeUndefined();
  });

  test.each(ADMIN_ROUTES.flatMap(definition => Object.entries(definition.methods)
    .filter(([, operation]) => !hasAdminCapability("administrator", operation.capability))
    .map(([method]) => ({ method, path: definition.path.replace(":id", "synthetic") }))))(
    "administrator cannot invoke $method $path", async ({ method, path }) => {
      const recordAdminAuditEvent = vi.fn().mockResolvedValue(undefined);
      const dependencies = new Proxy({ recordAdminAuditEvent }, { get(target, key) {
        if (key === "recordAdminAuditEvent") return target.recordAdminAuditEvent;
        throw new Error("Forbidden operations must not access resource dependencies");
      } });
      const response = await handleAdminApi(request(path, method), {} as Env, administrator, dependencies as never);
      expect(response.status).toBe(403);
    },
  );
});
