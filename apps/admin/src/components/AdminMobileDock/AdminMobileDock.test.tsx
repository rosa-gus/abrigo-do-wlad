import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAuth } from "../../contexts/AuthContext";
import { AdminMobileDock } from ".";

vi.mock("../../contexts/AuthContext", () => ({ useAuth: vi.fn() }));

describe("AdminMobileDock", () => {
  beforeEach(() => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
  });

  it("mostra apenas as rotas permitidas ao administrador e marca uma subrota ativa", () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { email: "admin@example.com", role: "administrator" },
      loading: false,
      error: null,
      logout: vi.fn(),
    });

    render(<MemoryRouter initialEntries={["/admin/dog/edit/123"]}><AdminMobileDock /></MemoryRouter>);

    const dock = screen.getByRole("navigation", { name: "Navegação administrativa" });
    expect(screen.getByRole("link", { name: "Cães" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Início" })).not.toHaveAttribute("aria-current");
    expect(screen.queryByRole("link", { name: "Dev" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Mostrar mais opções de navegação" }));
    expect(dock).toHaveAttribute("data-expanded", "true");
    expect(screen.getByRole("link", { name: "Adoções" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Dev" })).not.toBeInTheDocument();
  });

  it("inclui as opções de desenvolvedor para esse perfil", () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { email: "dev@example.com", role: "developer" },
      loading: false,
      error: null,
      logout: vi.fn(),
    });

    render(<MemoryRouter initialEntries={["/admin/dev-options"]}><AdminMobileDock /></MemoryRouter>);

    fireEvent.click(screen.getByRole("button", { name: "Mostrar mais opções de navegação" }));
    expect(screen.getByRole("link", { name: "Dev" })).toHaveAttribute("aria-current", "page");
  });
});
