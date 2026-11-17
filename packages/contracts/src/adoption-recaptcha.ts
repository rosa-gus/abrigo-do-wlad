export const ADOPTION_RECAPTCHA_ACTION = "submit_adoption";

declare const __ADOPTION_RECAPTCHA_BYPASS__: boolean;

// Only Vite's development server enables this; builds and plain Wrangler fail closed.
export function isAdoptionRecaptchaBypassed(): boolean {
  return (
    typeof __ADOPTION_RECAPTCHA_BYPASS__ !== "undefined" &&
    __ADOPTION_RECAPTCHA_BYPASS__ === true
  );
}

