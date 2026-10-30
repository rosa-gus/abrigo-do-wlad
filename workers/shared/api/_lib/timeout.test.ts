import { afterEach, expect, test, vi } from "vitest";
import { FirestoreRestClient } from "./firestore";
import { verifyRecaptcha } from "./security";
import { UpstreamTimeoutError, withUpstreamTimeout } from "./timeout";

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

test("times out and aborts an upstream even if it never settles", async () => {
  vi.useFakeTimers();
  let signal: AbortSignal | undefined;
  const result = withUpstreamTimeout((value) => {
    signal = value;
    return new Promise(() => {});
  }, "Serviço");
  const rejected = expect(result).rejects.toBeInstanceOf(UpstreamTimeoutError);
  await vi.advanceTimersByTimeAsync(8_000);
  await rejected;
  expect(signal?.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});

test("bounds a stalled Firestore authentication provider", async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn<typeof fetch>();
  const client = new FirestoreRestClient("test", {
    fetcher, tokenProvider: () => new Promise(() => {}),
  });
  const rejected = expect(client.getDocument("system/settings")).rejects.toBeInstanceOf(UpstreamTimeoutError);
  await vi.advanceTimersByTimeAsync(8_000);
  await rejected;
  expect(fetcher).not.toHaveBeenCalled();
});

test("also bounds a Firestore body that stalls after successful headers", async () => {
  vi.useFakeTimers();
  const client = new FirestoreRestClient("test", {
    fetcher: async () => new Response(new ReadableStream<Uint8Array>()),
    tokenProvider: async () => "synthetic",
  });
  const rejected = expect(client.getDocument("system/settings")).rejects.toBeInstanceOf(UpstreamTimeoutError);
  await vi.advanceTimersByTimeAsync(8_000);
  await rejected;
});

test("bounds a stalled reCAPTCHA verification instead of waiting indefinitely", async () => {
  vi.useFakeTimers();
  vi.spyOn(console, "error").mockImplementation(() => {});
  const result = verifyRecaptcha("synthetic", { RECAPTCHA_SECRET_KEY: "synthetic" }, {
    fetcher: () => new Promise(() => {}),
  });
  const rejected = expect(result).rejects.toBeInstanceOf(UpstreamTimeoutError);
  await vi.advanceTimersByTimeAsync(8_000);
  await rejected;
});
