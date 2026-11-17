import { afterEach, expect, test, vi } from "vitest";
import { FirestoreRestClient, FirestoreRestError } from "../../../workers/shared/api/_lib/firestore";
import { UpstreamTimeoutError } from "../../../workers/shared/api/_lib/timeout";
import { handleAdminApi } from "./admin-api";
import { logApiFailure, normalizeApiResponse, observeOperation, operationalErrorResponse, requestRouteForLog } from "./api-errors";
import type { AdminErrorResponse } from "../shared/api-error";

const context = { operationType: "query" as const, rpcMethod: "runAggregationQuery", collection: "dogs" };
afterEach(() => vi.restoreAllMocks());

test.each([false, true])("Firestore parses upstream error object/stream array: %s", async streamed => {
  const entry = { error: { status: "FAILED_PRECONDITION", message: "The query requires an index. provider-detail" } };
  const details = streamed ? [entry] : entry;
  const client = new FirestoreRestClient("synthetic-project", {
    tokenProvider: async () => "synthetic", fetcher: async () => Response.json(details, { status: 400, statusText: "Bad Request" }),
  });
  await expect(client.countDocuments("dogs")).rejects.toMatchObject({
    status: 400, code: "FAILED_PRECONDITION", upstreamMessage: entry.error.message,
    message: `Firestore request failed (400): ${entry.error.message}`, details, ...context,
  });
});

test("a query precondition failure is never reported as a stale edit", async () => {
  const failure = new FirestoreRestError("internal", 400, [{ error: { status: "FAILED_PRECONDITION", message: "The query requires an index." } }], context);
  const response = operationalErrorResponse(failure, "request-1", true);
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({ error: { code: "DATA_QUERY_FAILED", message: "Não foi possível carregar a visão geral.", requestId: "request-1" } });
  const conflict = new FirestoreRestError("internal", 400, { error: { status: "FAILED_PRECONDITION" } }, { operationType: "write", rpcMethod: "commit" });
  expect(operationalErrorResponse(conflict, "request-2").status).toBe(412);
});

test("dashboard concurrent failures log their own operation under one request ID", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const info = vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(FirestoreRestClient.prototype, "countDocuments").mockImplementation(async (_collection, options) => {
    if (options?.filters?.length === 2) throw new FirestoreRestError("private provider text", 400,
      [{ error: { status: "FAILED_PRECONDITION", message: "The query requires an index. SECRET_PAYLOAD secret@example.test" } }], context);
    if (options?.timestampAfter) throw new UpstreamTimeoutError("private upstream");
    return 0;
  });
  vi.spyOn(FirestoreRestClient.prototype, "findDocumentsByTimestampRange").mockResolvedValue([]);
  vi.spyOn(FirestoreRestClient.prototype, "getDocument").mockResolvedValue(null);
  const response = await handleAdminApi(new Request("https://admin.test/api/admin/dashboard", { headers: { "X-Request-ID": "forged-id" } }),
    { FIREBASE_PROJECT_ID: "synthetic-project" } as Env,
    { role: "developer", email: "developer@example.test", subject: "subject" });
  expect(response.status).toBe(500);
  const { error } = await response.json() as AdminErrorResponse;
  expect(error.code).toBe("DATA_QUERY_FAILED");
  expect(error.requestId).not.toBe("forged-id");
  expect(response.headers.get("X-Request-ID")).toBe(error.requestId);
  const logs = log.mock.calls.map(([line]) => JSON.parse(String(line)));
  expect(logs).toContainEqual(expect.objectContaining({ event: "admin.dependency.failed", requestId: error.requestId,
    operation: "dashboard.dogs.countArchivedPublished", collection: "dogs", rpcMethod: "runAggregationQuery",
    upstreamHttpStatus: 400, upstreamCode: "FAILED_PRECONDITION", diagnostic: "The query requires an index." }));
  expect(logs).toContainEqual(expect.objectContaining({ event: "admin.dependency.failed", requestId: error.requestId, operation: "dashboard.adoptions.countActive", errorType: "UpstreamTimeoutError" }));
  expect(logs).toContainEqual(expect.objectContaining({ event: "admin.api.error", requestId: error.requestId, operation: "dashboard.dogs.countArchivedPublished" }));
  expect(info.mock.calls.map(([line]) => JSON.parse(String(line)))).toContainEqual(expect.objectContaining({ event: "admin.api.completed", requestId: error.requestId, status: 500 }));
  expect(JSON.stringify([logs, error])).not.toMatch(/SECRET_PAYLOAD|secret@example|private provider|private upstream/);
});

test("unknown provider errors never copy arbitrary diagnostics into logs or responses", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const error = new FirestoreRestError("SECRET_PAYLOAD", 400,
    { error: { status: "INVALID_ARGUMENT", message: "SECRET_PAYLOAD secret@example.test token=abc" } }, context);
  logApiFailure("admin.api.error", "request-safe", error);
  const response = operationalErrorResponse(error, "request-safe");
  expect(JSON.stringify([log.mock.calls, await response.json()])).not.toMatch(/SECRET_PAYLOAD|secret@example|token=abc/);
});

test("a timed out named operation retains 504 and correlation", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  let failure: unknown;
  try { await observeOperation("dashboard.statistics.read", "request-timeout", async () => { throw new UpstreamTimeoutError("database"); }); }
  catch (error) { failure = error; }
  const response = operationalErrorResponse(failure, "request-timeout");
  expect(response.status).toBe(504);
  expect((await response.json() as AdminErrorResponse).error).toMatchObject({ code: "UPSTREAM_TIMEOUT", requestId: "request-timeout" });
});

test.each([
  { status: 405, header: "Allow", value: "GET", code: "METHOD_NOT_ALLOWED" },
  { status: 429, header: "Retry-After", value: "60", code: "RATE_LIMITED" },
])("error normalization preserves protocol headers for HTTP $status", async ({ status, header, value, code }) => {
  const response = await normalizeApiResponse(new Response(null, { status, headers: { [header]: value } }), "request-header");
  expect(response.headers.get(header)).toBe(value);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(response.headers.get("X-Request-ID")).toBe("request-header");
  expect((await response.json() as AdminErrorResponse).error).toMatchObject({ code, requestId: "request-header" });
});

test("request labels exclude document IDs and query values", () => {
  expect(requestRouteForLog(new Request("https://admin.test/api/admin/adoptions/private-id/status?token=secret")))
    .toBe("/api/admin/adoptions/:id/status");
  expect(requestRouteForLog(new Request("https://admin.test/api/arbitrary-email@example.test"))).toBe("/api/unknown");
});
