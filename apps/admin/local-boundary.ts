import type { Connect } from "vite";

const LOOPBACK_IPS = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

export function createLocalAdminBoundary(): Connect.NextHandleFunction {
  return (request, response, next) => {
    const host = request.headers.host;
    if (
      !LOOPBACK_IPS.has(request.socket.remoteAddress ?? "") ||
      (host !== "127.0.0.1:5174" && host !== "localhost:5174") ||
      (request.headers.origin !== undefined && request.headers.origin !== `http://${host}`) ||
      request.headers.forwarded !== undefined || request.headers["x-forwarded-host"] !== undefined ||
      request.headers["cf-connecting-ip"] !== undefined
    ) {
      response.writeHead(403, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      response.end(JSON.stringify({ error: "Local admin accepts direct loopback requests only." }));
      return;
    }
    next();
  };
}
