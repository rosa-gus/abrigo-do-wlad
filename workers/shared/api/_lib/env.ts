export type CloudflareStringEnvKey = string;

type KvBinding = {
  get(key: string): Promise<string | null>;
  put(
    key: string,
    value: string | ArrayBuffer | ArrayBufferView | ReadableStream,
    options?: KVNamespacePutOptions,
  ): Promise<void>;
};
type AssetsBinding = Pick<Fetcher, "fetch">;

export type CloudflareEnv = Partial<Omit<Env, "KV" | "ASSETS">> & {
  ADOPTION_CLEANUP_MODE?: string;
  KV?: KvBinding;
  NODE_ENV?: string;
  ASSETS?: AssetsBinding;
};

export function getEnvValue(
  env: CloudflareEnv | undefined,
  key: CloudflareStringEnvKey,
  fallback?: string,
): string | undefined {
  const envValue = (env as Record<string, unknown> | undefined)?.[key];
  const normalizedEnvValue = typeof envValue === "string" ? envValue : undefined;

  return normalizedEnvValue ?? process.env[key] ?? fallback;
}

export function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
}
