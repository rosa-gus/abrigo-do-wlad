export class UpstreamTimeoutError extends Error {
  constructor(service: string) {
    super(`${service} demorou mais que o esperado. Tente novamente.`);
    this.name = "UpstreamTimeoutError";
  }
}

/** Bounds the whole operation, including response-body reads and non-cooperative mocks. */
export async function withUpstreamTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  service: string,
  timeoutMs = 8_000,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new UpstreamTimeoutError(service));
      controller.abort();
    }, timeoutMs);
  });
  try {
    return await Promise.race([operation(controller.signal), deadline]);
  } finally {
    clearTimeout(timer);
  }
}
