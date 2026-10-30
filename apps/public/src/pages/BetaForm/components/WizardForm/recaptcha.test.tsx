import { afterEach, expect, test, vi } from "vitest";
import { cleanupRecaptcha, executeAdoptionRecaptcha, loadRecaptcha, RECAPTCHA_SCRIPT_ID } from "./recaptcha";

afterEach(() => {
  cleanupRecaptcha();
  vi.useRealTimers();
});

test("captures exceptions thrown inside the asynchronous ready callback", async () => {
  let onReady: (() => void) | undefined;
  vi.stubGlobal("grecaptcha", {
    ready: (callback: () => void) => { onReady = callback; },
    execute: () => { throw new Error("invalid configuration"); },
  });
  const token = executeAdoptionRecaptcha("synthetic-key");
  const rejected = expect(token).rejects.toThrow("Não foi possível concluir");
  onReady!();
  await rejected;
});

test("rejects a runtime that never becomes ready and allows a fresh attempt", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("grecaptcha", { ready: vi.fn(), execute: vi.fn() });
  const token = executeAdoptionRecaptcha("synthetic-key");
  const rejected = expect(token).rejects.toThrow("demorou mais que o esperado");
  await vi.advanceTimersByTimeAsync(15_000);
  await rejected;
  const oldScript = document.getElementById(RECAPTCHA_SCRIPT_ID)!;
  const retry = executeAdoptionRecaptcha("synthetic-key");
  const script = document.getElementById(RECAPTCHA_SCRIPT_ID)!;
  expect(script).not.toBe(oldScript);
  vi.stubGlobal("grecaptcha", {
    ready: (callback: () => void) => callback(),
    execute: async () => "retry-token",
  });
  script.dispatchEvent(new Event("load"));
  await expect(retry).resolves.toBe("retry-token");
});

test("reports a preload error and rejects an in-progress verification", async () => {
  const onError = vi.fn();
  loadRecaptcha("synthetic-key", onError);
  const token = executeAdoptionRecaptcha("synthetic-key");
  const rejected = expect(token).rejects.toThrow("Não foi possível concluir");
  document.getElementById(RECAPTCHA_SCRIPT_ID)!.dispatchEvent(new Event("error"));
  await rejected;
  expect(onError).toHaveBeenCalledOnce();
});
