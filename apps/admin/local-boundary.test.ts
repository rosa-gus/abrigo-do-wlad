import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import { expect, test, vi } from "vitest";
import { createLocalAdminBoundary } from "./local-boundary";

function harness(headers: IncomingMessage["headers"] = {}, ip = "127.0.0.1") {
  const socket = new Socket();
  Object.defineProperty(socket, "remoteAddress", { value: ip });
  const request = new IncomingMessage(socket);
  request.headers = { host: "127.0.0.1:5174", ...headers };
  const response = new ServerResponse(request);
  const end = vi.spyOn(response, "end").mockImplementation(() => response);
  const next = vi.fn();
  return { request, response, next, end };
}

test("allows direct loopback navigation and same-origin API requests", () => {
  for (const headers of [{}, { origin: "http://127.0.0.1:5174" }]) {
    const attempt = harness(headers);
    createLocalAdminBoundary()(attempt.request, attempt.response, attempt.next);
    expect(attempt.next).toHaveBeenCalledOnce();
    expect(attempt.end).not.toHaveBeenCalled();
  }
});

test.each([
  { "x-forwarded-host": "127.0.0.1:5174" },
  { "cf-connecting-ip": "127.0.0.1" },
  { forwarded: "host=127.0.0.1:5174" },
  { origin: "https://external.example.test" },
  { host: "external.example.test" },
])("rejects untrusted forwarding, markers, hosts and origins", (headers) => {
  const middleware = createLocalAdminBoundary();
  const attempt = harness(headers);
  middleware(attempt.request, attempt.response, attempt.next);
  expect(attempt.response.statusCode).toBe(403);
  expect(attempt.next).not.toHaveBeenCalled();
});

test("rejects a remote socket even with a loopback Host", () => {
  const attempt = harness({}, "198.51.100.1");
  createLocalAdminBoundary()(attempt.request, attempt.response, attempt.next);
  expect(attempt.response.statusCode).toBe(403);
  expect(attempt.next).not.toHaveBeenCalled();
});
