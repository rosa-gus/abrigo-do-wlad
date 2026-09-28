import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { VLibrasWidget } from ".";
import { openVLibras } from "./vlibrasBridge";

describe("VLibrasWidget", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("usa o botão original pela dock e o mostra quando a dock não existe", () => {
    const accessButton = document.createElement("button");
    const click = vi.spyOn(accessButton, "click");
    vi.stubGlobal("VLibrasWidget", { initBtn: accessButton });
    vi.stubGlobal("matchMedia", vi.fn(() => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })));

    const view = render(
      <MemoryRouter initialEntries={["/"]}>
        <VLibrasWidget />
      </MemoryRouter>,
    );

    expect(document.documentElement).toHaveAttribute("data-vlibras-in-dock", "");
    expect(accessButton.tabIndex).toBe(-1);
    expect(openVLibras()).toBe(true);
    expect(click).toHaveBeenCalledOnce();

    view.unmount();
    render(
      <MemoryRouter initialEntries={["/beta/formulario/step/1"]}>
        <VLibrasWidget />
      </MemoryRouter>,
    );

    expect(document.documentElement).not.toHaveAttribute("data-vlibras-in-dock");
    expect(accessButton.hasAttribute("tabindex")).toBe(false);
  });
});
