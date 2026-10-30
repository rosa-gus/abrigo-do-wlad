import { expect, test, vi } from "vitest";
import { FirestoreRestError, type FirestoreDocument } from "../_lib/firestore";
import { deliverNotification } from "./notification";

const now = () => new Date("2026-10-30T12:00:00.000Z");
function document(overrides: Record<string, unknown> = {}): FirestoreDocument<Record<string, unknown>> {
  return { id: "test", name: "projects/test/databases/(default)/documents/adoption_application/test",
    updateTime: "v1", data: {
      notificationStatus: "failed", notificationAttempts: 1,
      notificationLeaseUntil: "2026-10-30T11:59:00.000Z", ...overrides,
    } };
}

test("recovers the recorded successful delivery without sending a second email", async () => {
  const send = vi.fn(async () => true);
  const updateDocument = vi.fn();
  await expect(deliverNotification({ updateDocument }, document({ notificationStatus: "sent" }), send, now)).resolves.toBe(true);
  expect(send).not.toHaveBeenCalled();
  expect(updateDocument).not.toHaveBeenCalled();
});

test("does not start another delivery while an existing attempt holds its lease", async () => {
  const send = vi.fn(async () => true);
  const updateDocument = vi.fn();
  await expect(deliverNotification({ updateDocument }, document({
    notificationStatus: "pending", notificationLeaseUntil: "2026-10-30T12:01:00.000Z",
  }), send, now)).resolves.toBe(false);
  expect(send).not.toHaveBeenCalled();
});

test("only one concurrent retry can claim and persist a failed notification", async () => {
  let version = "v1";
  const updateDocument = vi.fn(async (_name: string, _data: Record<string, unknown>, options?: { expectedUpdateTime?: string }) => {
    if (options?.expectedUpdateTime !== version) throw new FirestoreRestError("Conflict", 412);
    version = version === "v1" ? "v2" : "v3";
    return { updateTime: version };
  });
  const send = vi.fn(async () => true);
  const results = await Promise.all([
    deliverNotification({ updateDocument }, document(), send, now),
    deliverNotification({ updateDocument }, document(), send, now),
  ]);
  expect(results.filter(Boolean)).toHaveLength(1);
  expect(send).toHaveBeenCalledOnce();
  expect(updateDocument).toHaveBeenLastCalledWith(expect.any(String), expect.objectContaining({ notificationStatus: "sent" }), { expectedUpdateTime: "v2" });
});

test("stops automatic delivery attempts after the configured retry budget", async () => {
  const send = vi.fn(async () => true);
  const updateDocument = vi.fn();
  await expect(deliverNotification({ updateDocument }, document({ notificationAttempts: 3 }), send, now)).resolves.toBe(false);
  expect(send).not.toHaveBeenCalled();
});
