import { getEnvValue, type CloudflareEnv } from "./env";

interface EmailOptions {
  subject: string;
  html: string;
  text: string;
  debug?: boolean;
}

export async function sendEmail(
  options: EmailOptions,
  env?: CloudflareEnv,
): Promise<void> {
  const url = getEnvValue(env, "EMAIL_WEBHOOK_URL");
  const secret = getEnvValue(env, "EMAIL_WEBHOOK_SECRET");

  if (!url || !secret) {
    throw new Error("Email webhook is not configured.");
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      secret,
      subject: options.subject,
      text: options.text,
      html: options.html,
      debug:
        options.debug === true ||
        getEnvValue(env, "APP_ENV") !== "production",
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`Email webhook returned HTTP ${response.status}.`);
  }

  const result: unknown = await response.json();
  if (typeof result !== "object" || result === null || !("ok" in result) || result.ok !== true) {
    throw new Error("Email webhook did not confirm delivery.");
  }
}

// Static light-theme values from packages/ui/src/styles/theme.css. Email clients
// cannot consume workspace CSS or reliably resolve CSS custom properties.
const EMAIL_THEME = {
  background: "#f2f8f8",
  card: "#fffdf9",
  water: "#dceff0",
  coral: "#fde6df",
  navy: "#02264b",
  primary: "#056b78",
  action: "#b23d20",
  text: "#1e2926",
  secondary: "#405658",
  muted: "#5f6f70",
  border: "#d7e2e1",
};

function escapeEmailHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!);
}

export function generateAdoptionApplicationEmail(
  applicationData: Record<string, unknown>,
  applicationId: string,
  env?: CloudflareEnv,
): { html: string; text: string } {
  const nome = typeof applicationData.nome_adotante === "string"
    && applicationData.nome_adotante.trim()
    ? applicationData.nome_adotante.trim() : "Candidato";
  const animal = typeof applicationData.animal_especifico === "string"
    && applicationData.animal_especifico.trim()
    ? applicationData.animal_especifico.trim() : "Não especificado";
  const panelUrl = getEnvValue(env, "ADMIN_PANEL_URL") || "#";
  const c = EMAIL_THEME;

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="color-scheme" content="light" />
    <meta name="supported-color-schemes" content="light" />
    <title>Nova candidatura de adoção · Abrigo do Wlad</title>
    <style>
      body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
      table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
      a:focus-visible { outline: 3px solid ${c.primary}; outline-offset: 4px; }
      @media only screen and (max-width: 600px) {
        .email-shell { padding: 24px 12px !important; }
        .email-padding { padding-left: 24px !important; padding-right: 24px !important; }
        .email-heading { font-size: 29px !important; line-height: 36px !important; }
        .email-summary { padding: 20px !important; }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;width:100%;background-color:${c.background};color:${c.text};font-family:'Poppins',Arial,Helvetica,sans-serif;">
    <div aria-hidden="true" style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">
      Nova candidatura de pré-adoção recebida. Aguardando análise.
    </div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${c.background}">
      <tr>
        <td class="email-shell" align="center" style="padding:40px 16px;">
          <!--[if mso]><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;table-layout:fixed;">
            <tr>
              <td style="background-color:${c.card};border:1px solid ${c.border};border-radius:24px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="table-layout:fixed;">
                  <tr>
                    <td class="email-padding" style="padding:32px 32px 24px;">
                      <p style="text-align:center;margin:0 0 5px;color:${c.navy};font-size:21px;line-height:28px;font-weight:700;letter-spacing:-0.42px;">Abrigo do Wlad</p>
                      <p style="text-align:center;margin:0;color:${c.primary};font-size:10px;line-height:16px;font-weight:600;letter-spacing:1.2px;text-transform:uppercase;">Painel administrativo</p>
                    </td>
                  </tr>
                  <tr>
                    <td class="email-padding" style="padding:0 32px 28px;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${c.water}" style="background-color:${c.water};border-radius:16px;table-layout:fixed;">
                        <tr>
                          <td class="email-summary" style="padding:28px;">
                            <p style="text-align:center;margin:0 0 14px;color:${c.primary};font-size:11px;line-height:16px;font-weight:700;letter-spacing:0.88px;text-transform:uppercase;">Notificação de pré-adoção</p>
                            <h1 class="email-heading" style="text-align:center;margin:0 0 14px;color:${c.navy};font-size:34px;line-height:41px;font-weight:700;letter-spacing:-1.19px;">Nova candidatura de adoção</h1>
                            <p style="text-align:center;margin:0;color:${c.secondary};font-size:15px;line-height:25px;">Formulário recebido. Aguardando análise no painel administrativo.</p>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <td class="email-padding" style="padding:0 32px 32px;">
                      <h2 style="text-align:center;margin:0 0 20px;color:${c.navy};font-size:17px;line-height:24px;font-weight:600;letter-spacing:-0.34px;">Resumo da candidatura</h2>
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="table-layout:fixed;">
                        <tr>
                          <td style="padding:0 0 18px;border-bottom:1px solid ${c.border};overflow-wrap:anywhere;word-break:break-word;">
                            <p style="text-align:center;margin:0 0 6px;color:${c.muted};font-size:11px;line-height:17px;font-weight:600;letter-spacing:0.88px;text-transform:uppercase;">Pessoa candidata</p>
                            <p style="text-align:center;margin:0;color:${c.text};font-size:19px;line-height:28px;font-weight:600;">${escapeEmailHtml(nome)}</p>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding:18px 0;border-bottom:1px solid ${c.border};overflow-wrap:anywhere;word-break:break-word;">
                            <p style="text-align:center;margin:0 0 6px;color:${c.muted};font-size:11px;line-height:17px;font-weight:600;letter-spacing:0.88px;text-transform:uppercase;">Animal de interesse</p>
                            <p style="text-align:center;margin:0;color:${c.text};font-size:19px;line-height:28px;font-weight:600;">${escapeEmailHtml(animal)}</p>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding:18px 0 26px;overflow-wrap:anywhere;word-break:break-all;">
                            <p style="text-align:center;margin:0 0 6px;color:${c.muted};font-size:11px;line-height:17px;font-weight:600;letter-spacing:0.88px;text-transform:uppercase;">Identificador da ficha</p>
                            <p style="text-align:center;margin:0;color:${c.secondary};font-family:Consolas,'Courier New',monospace;font-size:12px;line-height:20px;">${escapeEmailHtml(applicationId)}</p>
                          </td>
                        </tr>
                      </table>
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                        <tr>
                          <td align="center" bgcolor="${c.coral}" style="background-color:${c.coral};border-radius:8px;mso-padding-alt:16px 24px;">
                            <a href="${escapeEmailHtml(panelUrl)}" style="display:block;padding:16px 24px;border:1px solid ${c.coral};border-radius:8px;color:${c.action};font-size:15px;line-height:22px;font-weight:600;text-align:center;text-decoration:none;mso-padding-alt:0;">Analisar candidatura <span aria-hidden="true">&rarr;</span></a>
                          </td>
                        </tr>
                      </table>
                      <p style="text-align:center;margin:14px 0 0;color:${c.muted};font-size:12px;line-height:20px;">Os dados completos estão disponíveis no painel administrativo.</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:24px 16px 0;">
                <p style="text-align:center;margin:0 0 5px;color:${c.primary};font-size:12px;line-height:20px;font-weight:600;">Abrigo do Wlad</p>
                <p style="text-align:center;margin:0;color:${c.muted};font-size:11px;line-height:18px;">Esta é uma notificação automática.<br />Por favor, não responda a este e-mail.</p>
              </td>
            </tr>
          </table>
          <!--[if mso]></td></tr></table><![endif]-->
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = `Nova candidatura de pré-adoção · Abrigo do Wlad

Formulário recebido. Aguardando análise no painel administrativo.

Pessoa candidata: ${nome}
Animal de interesse: ${animal}
Identificador da ficha: ${applicationId}

Analisar candidatura: ${panelUrl}

Os dados completos estão disponíveis no painel administrativo.

Esta é uma notificação automática. Por favor, não responda a este e-mail.`;

  return { html, text };
}
