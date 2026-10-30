export const ADOPTION_RECAPTCHA_ACTION = "submit_adoption";

declare const __ADOPTION_RECAPTCHA_BYPASS__: boolean;

// Only Vite's development server enables this; builds and plain Wrangler fail closed.
export function isAdoptionRecaptchaBypassed(): boolean {
  return (
    typeof __ADOPTION_RECAPTCHA_BYPASS__ !== "undefined" &&
    __ADOPTION_RECAPTCHA_BYPASS__ === true
  );
}

export const RECAPTCHA_SCRIPT_ID = "recaptcha-v3-script";

const RECAPTCHA_HOSTS = new Set(["www.google.com", "www.gstatic.com"]);

function isRecaptchaResource(element: HTMLScriptElement | HTMLIFrameElement) {
  try {
    const url = new URL(element.src);
    return RECAPTCHA_HOSTS.has(url.hostname) && url.pathname.includes("/recaptcha/");
  } catch {
    return false;
  }
}

export function cleanupRecaptcha() {
  document
    .querySelectorAll<HTMLScriptElement | HTMLIFrameElement>("script[src], iframe[src]")
    .forEach((element) => {
      if (isRecaptchaResource(element)) {
        element.remove();
      }
    });

  document
    .querySelectorAll(
      '.grecaptcha-badge, [id^="google_recaptcha_"], textarea[name^="g-recaptcha-response"]',
    )
    .forEach((element) => element.remove());

  Reflect.deleteProperty(window, "grecaptcha");
  Reflect.deleteProperty(window, "___grecaptcha_cfg");
}

const RECAPTCHA_ERROR = "Não foi possível concluir a verificação de segurança. Verifique sua conexão e tente novamente.";

interface RecaptchaRuntime {
  ready(callback: () => void): void;
  execute(siteKey: string, options: { action: string }): Promise<string>;
}

function getRuntime(): RecaptchaRuntime | undefined {
  return (window as Window & { grecaptcha?: RecaptchaRuntime }).grecaptcha;
}

function ensureRecaptchaScript(siteKey: string): HTMLScriptElement {
  if (!siteKey?.trim()) throw new Error("A verificação de segurança está indisponível. Tente novamente mais tarde.");
  let script = document.getElementById(RECAPTCHA_SCRIPT_ID) as HTMLScriptElement | null;
  if (script?.dataset.loadFailed === "true") {
    cleanupRecaptcha();
    script = null;
  }
  if (!script) {
    script = document.createElement("script");
    script.id = RECAPTCHA_SCRIPT_ID;
    script.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(siteKey)}`;
    script.addEventListener("error", () => { script!.dataset.loadFailed = "true"; }, { once: true });
    document.body.appendChild(script);
  }
  return script;
}

export function loadRecaptcha(siteKey: string, onError?: (message: string) => void) {
  const reportError = () => onError?.(RECAPTCHA_ERROR);
  try {
    const script = ensureRecaptchaScript(siteKey);
    script.addEventListener("error", reportError);
    return () => {
      script.removeEventListener("error", reportError);
      cleanupRecaptcha();
    };
  } catch (error) {
    onError?.(error instanceof Error ? error.message : RECAPTCHA_ERROR);
    return cleanupRecaptcha;
  }
}

export function executeAdoptionRecaptcha(siteKey: string): Promise<string> {
  if (isAdoptionRecaptchaBypassed()) return Promise.resolve("");
  return new Promise((resolve, reject) => {
    let settled = false;
    let started = false;
    let script: HTMLScriptElement | undefined;
    const finish = (error: Error | null, token?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      script?.removeEventListener("load", run);
      script?.removeEventListener("error", fail);
      if (error) reject(error);
      else resolve(token!);
    };
    const timeout = setTimeout(() => {
      // Discard an incomplete runtime so a later attempt can load it again.
      if (script) script.dataset.loadFailed = "true";
      finish(new Error("A verificação de segurança demorou mais que o esperado. Tente novamente."));
    }, 15_000);
    const fail = () => finish(new Error(RECAPTCHA_ERROR));
    function run() {
      if (settled || started) return;
      const runtime = getRuntime();
      if (!runtime) { fail(); return; }
      started = true;
      try {
        runtime.ready(() => {
          if (settled) return;
          // Exceptions inside this callback do not reach the Promise executor.
          void (async () => {
            try {
              const token = await runtime.execute(siteKey, { action: ADOPTION_RECAPTCHA_ACTION });
              if (typeof token !== "string" || !token.trim()) throw new Error(RECAPTCHA_ERROR);
              finish(null, token);
            } catch {
              fail();
            }
          })();
        });
      } catch {
        fail();
      }
    }
    try {
      script = ensureRecaptchaScript(siteKey);
      script.addEventListener("load", run);
      script.addEventListener("error", fail);
      if (getRuntime()) run();
    } catch (error) {
      finish(error instanceof Error ? error : new Error(RECAPTCHA_ERROR));
    }
  });
}
