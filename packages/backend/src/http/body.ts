import { MAX_REQUEST_SIZE } from "./constants";

export class RequestBodyTooLargeError extends Error {
  constructor() {
    super("Request body exceeds the configured size limit.");
    this.name = "RequestBodyTooLargeError";
  }
}

export async function readBodyBytesWithLimit(
  request: Pick<Request, "body">,
  maxBytes = MAX_REQUEST_SIZE,
): Promise<Uint8Array<ArrayBuffer>> {
  if (!request.body) {
    return new Uint8Array(0);
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      totalBytes += value.byteLength;

      if (totalBytes > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new RequestBodyTooLargeError();
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;

  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return body;
}

export async function readJsonBodyWithLimit(
  request: Request,
  maxBytes = MAX_REQUEST_SIZE,
): Promise<unknown> {
  const body = await readBodyBytesWithLimit(request, maxBytes);
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body)) as unknown;
}

