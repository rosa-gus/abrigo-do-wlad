import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MobileDock } from ".";
import { ThemeToggle } from "@/components/ThemeToggle";
import { STORAGE_KEYS } from "@/lib/storage";
import { STORE_URL } from "@/utils/links";

vi.mock("@/components/PixModal", () => ({ default: () => null }));

describe("MobileDock", () => {
  beforeEach(() => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
  });

  it("avança as opções por seleção, ignora o arrasto lateral e expande com o vertical", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <MobileDock />
      </MemoryRouter>,
    );

    const dock = screen.getByRole("navigation", { name: "Navegação principal" });
    const donationShortcut = screen.getByRole("button", { name: "Doar" });
    expect(dock).toContainElement(donationShortcut);
    expect(screen.getByRole("link", { name: "Cães" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Sobre" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "Tampinhas" }));
    expect(screen.queryByRole("link", { name: "Cães" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sobre" })).toBeInTheDocument();

    fireEvent.pointerDown(dock, { pointerId: 1, clientX: 180, clientY: 100 });
    fireEvent.pointerMove(dock, { pointerId: 1, clientX: 125, clientY: 100 });
    fireEvent.pointerUp(dock, { pointerId: 1, clientX: 100, clientY: 100 });
    expect(screen.getByRole("link", { name: "Tampinhas" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sobre" })).toBeInTheDocument();
    expect(dock).toHaveAttribute("data-expanded", "false");

    await user.click(screen.getByRole("link", { name: "Sobre" }));
    expect(screen.queryByRole("link", { name: "Tampinhas" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Formulário" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Libras" })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Ações rápidas" })).not.toBeInTheDocument();

    fireEvent.pointerDown(donationShortcut, { pointerId: 2, clientX: 100, clientY: 180 });
    fireEvent.pointerMove(donationShortcut, { pointerId: 2, clientX: 100, clientY: 125 });
    fireEvent.pointerUp(donationShortcut, { pointerId: 2, clientX: 100, clientY: 100 });
    expect(dock).toHaveAttribute("data-expanded", "true");
    expect(screen.getByRole("link", { name: "Cães" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Tampinhas" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Libras" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Formulário" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Privacidade" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tema" })).toBeInTheDocument();
    const actionsDock = screen.getByRole("group", { name: "Ações rápidas" });
    expect(dock).not.toContainElement(actionsDock);
    expect(actionsDock).toContainElement(screen.getByRole("button", { name: "Doar" }));
    const bazarLink = screen.getByRole("link", { name: "Bazar" });
    expect(actionsDock).toContainElement(bazarLink);
    expect(bazarLink).toHaveAttribute("href", STORE_URL);
    expect(bazarLink).toHaveAttribute("target", "_blank");
    expect(actionsDock.firstElementChild?.nextElementSibling).toBe(bazarLink);
    expect(dock).not.toContainElement(screen.getByRole("button", { name: "Doar" }));

    fireEvent.pointerDown(actionsDock, { pointerId: 3, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(actionsDock, { pointerId: 3, clientX: 100, clientY: 155 });
    fireEvent.pointerUp(actionsDock, { pointerId: 3, clientX: 100, clientY: 180 });
    expect(dock).toHaveAttribute("data-expanded", "false");
    expect(screen.queryByRole("group", { name: "Ações rápidas" })).not.toBeInTheDocument();
    expect(dock).toContainElement(screen.getByRole("button", { name: "Doar" }));
    expect(screen.queryByRole("link", { name: "Cães" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sobre" })).toBeInTheDocument();
  });

  it("não inclui privacidade na dock, mesmo nessa página", () => {
    render(
      <MemoryRouter initialEntries={["/politica-de-privacidade"]}>
        <MobileDock />
      </MemoryRouter>,
    );

    expect(screen.queryByRole("link", { name: "Privacidade" })).not.toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Navegação principal" })).toHaveAttribute("data-expanded", "false");
  });

  it("mostra a dock antes de fechá-la no formulário e permite reabri-la por toque", () => {
    vi.useFakeTimers();
    try {
      const { container } = render(
        <MemoryRouter initialEntries={["/beta/formulario/step/1"]}>
          <MobileDock />
        </MemoryRouter>,
      );

      const stack = container.querySelector("[data-edge-collapse='true']");
      expect(stack).toHaveAttribute("data-closed", "false");
      expect(screen.getByRole("navigation", { name: "Navegação principal" })).toBeInTheDocument();

      act(() => vi.advanceTimersByTime(1100));
      expect(stack).toHaveAttribute("data-closed", "true");
      expect(screen.queryByRole("navigation", { name: "Navegação principal" })).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Abrir navegação" }));
      expect(stack).toHaveAttribute("data-closed", "false");
      expect(screen.getByRole("link", { name: "Formulário" })).toHaveAttribute("aria-current", "page");

      const dock = screen.getByRole("navigation", { name: "Navegação principal" });
      fireEvent.pointerDown(dock, { pointerId: 6, clientX: 100, clientY: 100 });
      fireEvent.pointerMove(dock, { pointerId: 6, clientX: 100, clientY: 155 });
      fireEvent.pointerUp(dock, { pointerId: 6, clientX: 100, clientY: 180 });
      expect(stack).toHaveAttribute("data-closed", "true");

      fireEvent.click(screen.getByRole("button", { name: "Abrir navegação" }));
      fireEvent.pointerDown(screen.getByRole("navigation", { name: "Navegação principal" }));
      expect(stack).toHaveAttribute("data-closed", "false");
      fireEvent.pointerDown(document.body);
      expect(stack).toHaveAttribute("data-closed", "true");
    } finally {
      vi.useRealTimers();
    }
  });

  it("abre o VLibras pela opção da dock expandida", async () => {
    const accessButton = document.createElement("button");
    const click = vi.spyOn(accessButton, "click");
    vi.stubGlobal("VLibrasWidget", { initBtn: accessButton });

    render(
      <MemoryRouter initialEntries={["/sobre"]}>
        <MobileDock />
      </MemoryRouter>,
    );

    const dock = screen.getByRole("navigation", { name: "Navegação principal" });
    fireEvent.pointerDown(dock, { pointerId: 4, clientX: 100, clientY: 180 });
    fireEvent.pointerMove(dock, { pointerId: 4, clientX: 100, clientY: 125 });
    fireEvent.pointerUp(dock, { pointerId: 4, clientX: 100, clientY: 100 });

    await userEvent.setup().click(screen.getByRole("button", { name: "Libras" }));
    expect(click).toHaveBeenCalledOnce();
  });

  it("sincroniza o tema da dock com o controle do cabeçalho", async () => {
    localStorage.setItem(STORAGE_KEYS.UI.THEME, "light");
    render(
      <MemoryRouter>
        <ThemeToggle />
        <MobileDock />
      </MemoryRouter>,
    );

    const dock = screen.getByRole("navigation", { name: "Navegação principal" });
    fireEvent.pointerDown(dock, { pointerId: 5, clientX: 100, clientY: 180 });
    fireEvent.pointerMove(dock, { pointerId: 5, clientX: 100, clientY: 125 });
    fireEvent.pointerUp(dock, { pointerId: 5, clientX: 100, clientY: 100 });

    await userEvent.setup().click(screen.getByRole("button", { name: "Tema" }));
    expect(localStorage.getItem(STORAGE_KEYS.UI.THEME)).toBe("dark");
    expect(document.body).toHaveClass("dark-mode");
    expect(screen.getByRole("switch", { name: "Mudar para modo claro" })).toHaveAttribute("aria-checked", "true");
  });
});
