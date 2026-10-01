import { afterEach, expect, test, vi } from "vitest";
import { sendEmail } from "./email";

const env = {
  NODE_ENV: "production",
  EMAIL_WEBHOOK_URL: "https://script.google.com/macros/s/test/exec",
  EMAIL_WEBHOOK_SECRET: "test-secret",
};

const message = {
  subject: "Nova candidatura",
  text: "Candidatura recebida",
  html: "<p>Candidatura recebida</p>",
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

test("sends the notification to the Apps Script webhook", async () => {
  const fetchMock = vi.fn(async () => Response.json({ ok: true }));
  vi.stubGlobal("fetch", fetchMock);

  await sendEmail(message, env);

  expect(fetchMock).toHaveBeenCalledOnce();
  const [url, options] = fetchMock.mock.calls[0];
  expect(url).toBe(env.EMAIL_WEBHOOK_URL);
  expect(options.method).toBe("POST");
  expect(options.headers).toEqual({ "Content-Type": "application/json" });
  expect(JSON.parse(options.body)).toEqual({
    secret: env.EMAIL_WEBHOOK_SECRET,
    ...message,
    debug: false,
  });
});

test.each([undefined, false])("sends production notifications without debug when debug is %s", async (debug) => {
  const fetchMock = vi.fn(async () => Response.json({ ok: true }));
  vi.stubGlobal("fetch", fetchMock);

  await sendEmail({ ...message, debug }, env);

  const [, options] = fetchMock.mock.calls[0];
  expect(JSON.parse(options.body).debug).toBe(false);
});

test.each(["development", "test", "staging", "", undefined])(
  "forces debug outside production when NODE_ENV is %s",
  async (nodeEnv) => {
    vi.stubEnv("NODE_ENV", undefined);
    const fetchMock = vi.fn(async () => Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await sendEmail(message, { ...env, NODE_ENV: nodeEnv });
    await sendEmail({ ...message, debug: false }, { ...env, NODE_ENV: nodeEnv });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [, options] of fetchMock.mock.calls) {
      expect(JSON.parse(options.body).debug).toBe(true);
    }
  },
);

test("marks a test notification as debug even in production without accepting a recipient", async () => {
  const fetchMock = vi.fn(async () => Response.json({ ok: true }));
  vi.stubGlobal("fetch", fetchMock);

  await sendEmail({ ...message, debug: true }, env);

  const [, options] = fetchMock.mock.calls[0];
  expect(JSON.parse(options.body)).toEqual({
    secret: env.EMAIL_WEBHOOK_SECRET,
    ...message,
    debug: true,
  });
});

test("rejects a webhook response that does not confirm sending", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ok: false, error: "send_failed" })));

  await expect(sendEmail(message, env)).rejects.toThrow("did not confirm delivery");
});

test("rejects HTTP errors from the webhook", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("Unavailable", { status: 503 })));

  await expect(sendEmail(message, env)).rejects.toThrow("HTTP 503");
});
