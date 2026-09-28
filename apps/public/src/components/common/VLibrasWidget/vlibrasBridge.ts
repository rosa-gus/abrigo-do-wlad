type VLibrasWindow = Window &
  typeof globalThis & {
    VLibrasWidget?: {
      initBtn?: HTMLElement;
    };
  };

export const VLIBRAS_READY_EVENT = "vlibras:ready";

export function getVLibrasAccessButton(): HTMLElement | null {
  const exposedButton = (window as VLibrasWindow).VLibrasWidget?.initBtn;
  if (exposedButton) return exposedButton;

  const wrapper = document.querySelector("#vlibras-access-wrapper");
  return wrapper?.shadowRoot?.querySelector<HTMLElement>("#vlibras-access") ?? null;
}

export function openVLibras(): boolean {
  const accessButton = getVLibrasAccessButton();
  if (!accessButton) return false;
  accessButton.click();
  return true;
}
