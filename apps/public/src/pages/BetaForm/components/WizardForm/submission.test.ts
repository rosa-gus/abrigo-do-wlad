import assert from "node:assert/strict";
import { test, vi } from "vitest";

import {
  ADOPTION_IDEMPOTENCY_STORAGE_KEY,
  clearIdempotencyKey,
  getAdoptionApplicationId,
  getOrCreateIdempotencyKey,
  sendAdoptionApplication,
} from "./submission";

test("aborts an unconfirmed submission after 30 seconds and releases its timer", async () => {
  vi.useFakeTimers();
  let requestSignal: AbortSignal | null | undefined;
  vi.stubGlobal("fetch", vi.fn<typeof fetch>((_url, init) => {
    requestSignal = init?.signal;
    return new Promise((_resolve, reject) => {
      requestSignal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    });
  }));
  try {
    const result = sendAdoptionApplication({ captchaToken: "synthetic" }, "retry-key");
    const rejected = assert.rejects(result, /demorou para confirmar/);
    await vi.advanceTimersByTimeAsync(30_000);
    await rejected;
    assert.equal(requestSignal?.aborted, true);
    assert.equal(vi.getTimerCount(), 0);
  } finally {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();

  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}

test("reuses the idempotency key until the submission succeeds", () => {
  const storage = createMemoryStorage();

  const firstKey = getOrCreateIdempotencyKey(storage);
  const retryKey = getOrCreateIdempotencyKey(storage);

  assert.match(firstKey, /^[0-9a-f-]{36}$/i);
  assert.equal(retryKey, firstKey);
  assert.equal(storage.getItem(ADOPTION_IDEMPOTENCY_STORAGE_KEY), firstKey);

  clearIdempotencyKey(storage);
  assert.equal(storage.getItem(ADOPTION_IDEMPOTENCY_STORAGE_KEY), null);
  assert.notEqual(getOrCreateIdempotencyKey(storage), firstKey);
});

test("trims a previously stored idempotency key", () => {
  const storage = createMemoryStorage();
  const savedKey = "123e4567-e89b-42d3-a456-426614174000";
  storage.setItem(ADOPTION_IDEMPOTENCY_STORAGE_KEY, `  ${savedKey}  `);

  assert.equal(getOrCreateIdempotencyKey(storage), savedKey);
});

test("creates a key when session storage is unavailable", () => {
  const unavailableStorage = {
    getItem: () => {
      throw new Error("storage disabled");
    },
    setItem: () => {
      throw new Error("storage disabled");
    },
    removeItem: () => {
      throw new Error("storage disabled");
    },
  } as unknown as Storage;

  assert.match(getOrCreateIdempotencyKey(unavailableStorage), /^[0-9a-f-]{36}$/i);
  assert.doesNotThrow(() => clearIdempotencyKey(unavailableStorage));
});

test("reads the application ID from the API data envelope", async () => {
  const response = Response.json(
    { message: "Created", data: { id: "application-123" } },
    { status: 201 },
  );

  assert.deepEqual(await getAdoptionApplicationId(response), {
    applicationId: "application-123",
  });
});

test("accepts the idempotent duplicate response", async () => {
  const response = Response.json(
    {
      message: "Application already submitted",
      data: { id: "application-123", duplicate: true },
    },
    { status: 200 },
  );

  assert.deepEqual(await getAdoptionApplicationId(response), {
    applicationId: "application-123",
  });
});

test("preserves a notification warning without turning persistence into failure", async () => {
  const response = Response.json(
    {
      message: "Created",
      data: { id: "application-123", notificationEmailSent: false },
      warning: "A candidatura foi salva, mas a notificação falhou.",
    },
    { status: 201 },
  );

  assert.deepEqual(await getAdoptionApplicationId(response), {
    applicationId: "application-123",
    warning: "A candidatura foi salva, mas a notificação falhou.",
  });
});

test("surfaces the API error message when submission fails", async () => {
  const response = Response.json(
    { message: "Too many requests. Please try again later." },
    { status: 429 },
  );

  await assert.rejects(
    () => getAdoptionApplicationId(response),
    /Too many requests/,
  );
});

test("uses the fallback message when the API error is empty", async () => {
  const response = Response.json({ message: "   " }, { status: 500 });

  await assert.rejects(
    () => getAdoptionApplicationId(response),
    /Erro ao enviar formulário/,
  );
});

test("uses the fallback message when an error response is not JSON", async () => {
  const response = new Response("upstream unavailable", { status: 502 });

  await assert.rejects(
    () => getAdoptionApplicationId(response),
    /Erro ao enviar formulário/,
  );
});

test("rejects a successful response without an application ID", async () => {
  const response = Response.json({ message: "Created" }, { status: 201 });

  await assert.rejects(
    () => getAdoptionApplicationId(response),
    /não retornou o ID/,
  );
});

test.each(["", "   ", 123, null])(
  "rejects a successful response with invalid application ID %j",
  async (id) => {
    const response = Response.json(
      { message: "Created", data: { id } },
      { status: 201 },
    );

    await assert.rejects(
      () => getAdoptionApplicationId(response),
      /não retornou o ID/,
    );
  },
);

test.each(["", "   ", 123, null])(
  "ignores an invalid notification warning %j",
  async (warning) => {
    const response = Response.json(
      {
        message: "Created",
        data: { id: "application-123" },
        warning,
      },
      { status: 201 },
    );

    assert.deepEqual(await getAdoptionApplicationId(response), {
      applicationId: "application-123",
    });
  },
);

test("rejects a successful non-JSON response", async () => {
  const response = new Response("created", { status: 201 });

  await assert.rejects(
    () => getAdoptionApplicationId(response),
    /não retornou o ID/,
  );
});
