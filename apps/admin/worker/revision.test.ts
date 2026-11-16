import { expect, test } from "vitest";
import { assertRevision, expectedRevision, RevisionError, revisionEtag } from "./revision";

test("requires an observed strong revision and preserves sub-millisecond precision", () => {
  const revision = "2026-11-16T12:00:00.123456Z";
  const request = new Request("https://admin.test", { headers: { "If-Match": revisionEtag(revision) } });
  expect(expectedRevision(request)).toBe(revision);
  expect(() => assertRevision(expectedRevision(request), revision)).not.toThrow();
  expect(() => assertRevision(revision, "2026-11-16T12:00:00.123457Z")).toThrow(RevisionError);
  expect(() => expectedRevision(new Request("https://admin.test"))).toThrow(expect.objectContaining({ status: 428 }));
});

test.each(["*", 'W/"revision"', '"one", "two"', "unquoted"])("rejects unsafe If-Match %s", (value) => {
  expect(() => expectedRevision(new Request("https://admin.test", { headers: { "If-Match": value } }))).toThrow(expect.objectContaining({ status: 412 }));
});

test("absence is explicit and legacy revision is accepted only without a header", () => {
  expect(() => assertRevision("absent", undefined)).not.toThrow();
  expect(() => assertRevision("absent", "now-present")).toThrow(RevisionError);
  expect(expectedRevision(new Request("https://admin.test"), "legacy")).toBe("legacy");
});
