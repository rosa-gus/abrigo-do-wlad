import { describe, expect, it } from "vitest";
import { readJsonBodyWithLimit, RequestBodyTooLargeError } from "./body";

describe("bounded body reader", () => {
  it("counts UTF-8 bytes and cancels before consuming the whole body", async () => {
    let pulls = 0;
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) { pulls++; controller.enqueue(new TextEncoder().encode('éé')); },
      cancel() { cancelled = true; },
    });
    const request = new Request("https://example.test", { method: "POST", body: stream, duplex: "half" } as RequestInit);
    await expect(readJsonBodyWithLimit(request, 5)).rejects.toBeInstanceOf(RequestBodyTooLargeError);
    expect(cancelled).toBe(true);
    expect(pulls).toBeLessThanOrEqual(3);
  });
  it("accepts valid JSON at the byte limit and rejects malformed JSON", async () => {
    const request = () => new Request("https://example.test", { method: "POST", body: '"é"' });
    await expect(readJsonBodyWithLimit(request(), 4)).resolves.toBe("é");
    await expect(readJsonBodyWithLimit(request(), 3)).rejects.toBeInstanceOf(RequestBodyTooLargeError);
    await expect(readJsonBodyWithLimit(new Request("https://example.test", { method: "POST", body: "{" }), 4)).rejects.toThrow();
  });
});
