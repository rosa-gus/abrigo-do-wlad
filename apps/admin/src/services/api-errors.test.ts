import { afterEach, expect, test, vi } from "vitest";
import { ApiError, apiErrorFromResponse, apiErrorMessage, apiRequest } from "./api";
import { uploadImageToCloudinary } from "./cloudinary";

afterEach(() => vi.restoreAllMocks());

test("the client preserves structured codes and request IDs without retrying a failed operation", async () => {
  const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ error: {
    code: "DATA_QUERY_FAILED", message: "Não foi possível carregar a visão geral.", requestId: "request-123",
  } }, { status: 500, headers: { "X-Request-ID": "request-123" } }));
  let failure: unknown;
  try { await apiRequest("/api/admin/dashboard"); } catch (error) { failure = error; }
  expect(failure).toBeInstanceOf(ApiError);
  expect(failure).toMatchObject({ status: 500, code: "DATA_QUERY_FAILED", requestId: "request-123" });
  expect(apiErrorMessage(failure, "fallback")).toContain("Referência: request-123");
  expect(fetcher).toHaveBeenCalledOnce();
});

test("HTML proxy errors retain correlation from the header and a safe fallback", async () => {
  const failure = await apiErrorFromResponse(new Response("<html>internal upstream detail</html>", {
    status: 503, headers: { "X-Request-ID": "request-proxy" },
  }));
  expect(failure).toMatchObject({ status: 503, code: "SERVICE_UNAVAILABLE", requestId: "request-proxy" });
  expect(failure.message).not.toContain("internal upstream detail");
});

test("legacy responses remain readable during a client/server rollout", async () => {
  const failure = await apiErrorFromResponse(Response.json({ error: "Legacy safe message" }, { status: 409 }));
  expect(failure).toMatchObject({ code: "CONFLICT", message: "Legacy safe message" });
});

test.each([412, 428])("revision status %s keeps review guidance and metadata", async status => {
  const failure = await apiErrorFromResponse(Response.json({ error: { code: status === 412 ? "REVISION_MISMATCH" : "REVISION_REQUIRED", message: "Revision rejected", requestId: "request-revision" } }, { status }));
  expect(failure.message).toContain("Recarregue e revise");
  expect(failure.requestId).toBe("request-revision");
});

test("multipart upload uses the same structured error reader", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ error: {
    code: "UPSTREAM_TIMEOUT", message: "O serviço demorou mais que o esperado.", requestId: "request-upload",
  } }, { status: 504 }));
  await expect(uploadImageToCloudinary(new File(["image"], "dog.png", { type: "image/png" }))).rejects.toMatchObject({
    status: 504, code: "UPSTREAM_TIMEOUT", requestId: "request-upload",
  });
});

test("invalid error envelopes and unexpected exception text use safe fallbacks", async () => {
  const failure = await apiErrorFromResponse(Response.json({ error: { code: {}, message: "untrusted detail", requestId: {} } }, { status: 500 }));
  expect(failure.message).not.toContain("untrusted detail");
  expect(apiErrorMessage(new Error("sensitive internals"), "Não foi possível carregar.")).toBe("Não foi possível carregar.");
});
