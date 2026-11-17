import { expect, test, vi } from "vitest";
import { handleAdminApi, type AdminApiDependencies } from "./admin-api";
import { FirestoreRestClient } from "../../../workers/shared/api/_lib/firestore";

const identity = { email: "admin@example.test", role: "administrator", subject: "subject" } as const;
// Invalid bodies must exit before any application dependency beyond audit.
const unexpected = async (): Promise<never> => { throw new Error("Unexpected dependency access for an invalid body"); };
const dependencies: AdminApiDependencies = {
  recordAdminAuditEvent: async () => undefined,
  listAdoptionApplications: unexpected, getAdoptionApplication: unexpected,
  consumeUploadRateLimit: unexpected, listSystemKeys: unexpected,
  rotateSystemKey: unexpected, getAdminNotification: unexpected,
  saveAdminNotification: unexpected, deleteAdminNotification: unexpected,
  listAdminAuditEvents: unexpected, uploadCloudinaryImage: unexpected,
  saveDogTombstone: unexpected,
};
const env = { FIREBASE_PROJECT_ID: "test-project" } as Env;
function request(body: BodyInit) {
  return new Request("https://admin.example.test/api/admin/media/delete", {
    method: "POST", headers: { Origin: "https://admin.example.test", "Content-Type": "application/json" },
    body, duplex: "half",
  } as RequestInit);
}

test("admin rejects chunked multibyte JSON at 256 KiB without consuming the whole stream", async () => {
  let pulls = 0; let cancelled = false;
  const bytes = new TextEncoder().encode("é".repeat(32 * 1024));
  const body = new ReadableStream<Uint8Array>({
    pull(controller) { pulls++; controller.enqueue(bytes); },
    cancel() { cancelled = true; },
  });
  const req = request(body);
  expect(req.headers.has("Content-Length")).toBe(false);
  const firestore = vi.spyOn(FirestoreRestClient.prototype, "getDocument");
  try {
    const response = await handleAdminApi(req, env, identity, dependencies);
    expect(response.status).toBe(413);
    expect(cancelled).toBe(true);
    expect(pulls).toBeLessThanOrEqual(6);
    expect(firestore).not.toHaveBeenCalled();
  } finally { firestore.mockRestore(); }
});

test("admin malformed JSON and invalid UTF-8 receive 400", async () => {
  for (const body of ["{", new Uint8Array([0xff])]) {
    const response = await handleAdminApi(request(body), env, identity, dependencies);
    expect(response.status).toBe(400);
  }
});
