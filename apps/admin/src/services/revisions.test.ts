import { afterEach, expect, test, vi } from "vitest";
import { apiResource, revisionHeaders } from "./api";
import { updateAdoptionStatus } from "./adoptions";
import { deleteRecyclePoint } from "./recycle";
import { getSystemSettings, updateSystemSettings } from "./systemSettings";
import { getAdminNotificationResource, saveAdminNotification } from "./notifications";

afterEach(() => vi.restoreAllMocks());

test("services send the revision observed by the caller without reloading the resource", async () => {
  const fetcher = vi.spyOn(globalThis, "fetch").mockImplementation(async () => Response.json({ ok: true }));
  await updateAdoptionStatus("application", "approved", "observed");
  await deleteRecyclePoint("point", "observed");
  expect(fetcher).toHaveBeenCalledTimes(2);
  for (const [, options] of fetcher.mock.calls) {
    expect(options?.headers).toMatchObject({ "If-Match": '"observed"' });
  }
});

test("missing revisions and stale responses never trigger an automatic retry", async () => {
  const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ error: "stale" }, { status: 412 }));
  expect(() => revisionHeaders(undefined)).toThrow(expect.objectContaining({ status: 428 }));
  await expect(updateAdoptionStatus("application", "approved")).rejects.toMatchObject({ status: 428 });
  expect(fetcher).not.toHaveBeenCalled();
  await expect(updateAdoptionStatus("application", "approved", "old")).rejects.toMatchObject({ status: 412 });
  expect(fetcher).toHaveBeenCalledTimes(1);
});

test("expired notification keeps its stored ETag even when the body is null", async () => {
  const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json(null, { headers: { ETag: '"stored-revision"' } }))
    .mockResolvedValueOnce(Response.json({ revision: "written-revision" }));
  const resource = await getAdminNotificationResource();
  expect(resource).toEqual({ value: null, revision: "stored-revision" });
  await saveAdminNotification({ message: "New notice", type: "info", expiration: "1h" }, resource.revision);
  expect(fetcher.mock.calls[1][1]?.headers).toMatchObject({ "If-Match": '"stored-revision"' });
});

test("settings separate the write schema from server revision metadata", async () => {
  const fetcher = vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(Response.json({ acceptingApplications: true, revision: "first" }))
    .mockResolvedValueOnce(Response.json({ acceptingApplications: false, revision: "second" }));
  const settings = await getSystemSettings();
  expect(settings.revision).toBe("first");
  expect(await updateSystemSettings(false, settings.revision)).toEqual({ acceptingApplications: false, revision: "second" });
  expect(fetcher.mock.calls[1][1]?.body).toBe(JSON.stringify({ acceptingApplications: false }));
});

test("resource reads accept only a strong ETag", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json([], { headers: { ETag: 'W/"weak"' } }));
  expect((await apiResource("/api/admin/system-keys")).revision).toBeUndefined();
});
