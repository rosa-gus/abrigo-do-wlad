import { afterEach, expect, test, vi } from "vitest";
import { generateAdoptionApplicationEmail, sendEmail } from "./email";

const env = {
  APP_ENV: "production",
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

test.each(["local", "test", "staging", "", undefined])(
  "forces debug outside production when APP_ENV is %s",
  async (appEnv) => {
    vi.stubEnv("APP_ENV", undefined);
    const fetchMock = vi.fn(async () => Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await sendEmail(message, { ...env, APP_ENV: appEnv });
    await sendEmail({ ...message, debug: false }, { ...env, APP_ENV: appEnv });

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

test("renders the adoption summary and panel link in HTML and plain text", () => {
  const panelUrl = "https://admin.example.test/admin?source=email&view=adoptions";
  const { html, text } = generateAdoptionApplicationEmail({
    nome_adotante: "Marina Araújo",
    animal_especifico: "Amora",
  }, "application-123", { ADMIN_PANEL_URL: panelUrl });

  for (const content of [html, text]) {
    expect(content).toContain("Marina Araújo");
    expect(content).toContain("Amora");
    expect(content).toContain("application-123");
  }
  expect(html).toContain('href="https://admin.example.test/admin?source=email&amp;view=adoptions"');
  expect(text).toContain(`Analisar candidatura: ${panelUrl}`);
  expect(html.length).toBeLessThanOrEqual(50_000);
  expect(text.length).toBeLessThanOrEqual(20_000);
});

test("keeps candidate content and quoted links from injecting HTML", () => {
  const { html, text } = generateAdoptionApplicationEmail({
    nome_adotante: '<img src=x onerror="alert(1)">',
    animal_especifico: "Rex & 'Amora' <filhote>",
  }, "id<script>alert(1)</script>", { ADMIN_PANEL_URL: 'https://admin.example.test/?q=" onclick="bad' });

  expect(html).not.toContain("<img");
  expect(html).not.toContain("<script>");
  expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  expect(html).toContain("Rex &amp; &#39;Amora&#39; &lt;filhote&gt;");
  expect(html).toContain('href="https://admin.example.test/?q=&quot; onclick=&quot;bad"');
  expect(text).toContain("Rex & 'Amora' <filhote>");
});

test("renders readable fallbacks for an adoption without optional summary values", () => {
  vi.stubEnv("ADMIN_PANEL_URL", undefined);
  const { html, text } = generateAdoptionApplicationEmail({
    nome_adotante: " ", animal_especifico: null,
  }, "application-123");

  for (const content of [html, text]) {
    expect(content).toContain("Candidato");
    expect(content).toContain("Não especificado");
    expect(content).not.toContain("undefined");
  }
});
