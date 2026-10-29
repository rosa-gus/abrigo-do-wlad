import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { Button, ButtonLink } from ".";

describe("ButtonLink", () => {
  test("preserva a navegação nativa e os atributos do link", () => {
    const ref = createRef<HTMLAnchorElement>();
    render(
      <ButtonLink
        ref={ref}
        href="https://example.com/bazar"
        target="_blank"
        rel="noopener noreferrer"
        rightIcon={<svg aria-hidden="true" />}
      >
        Visitar bazar
      </ButtonLink>,
    );

    const link = screen.getByRole("link", { name: "Visitar bazar" });
    expect(link).toHaveAttribute("href", "https://example.com/bazar");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(ref.current).toBe(link);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  test.each(["strong", "soft", "minimal"] as const)("compartilha a ênfase %s sem mudar sua semântica", (emphasis) => {
    render(
      <>
        <Button variant="secondary" emphasis={emphasis} size="lg" blur disabled>Salvar</Button>
        <ButtonLink variant="secondary" emphasis={emphasis} size="lg" blur href="/bazar">Bazar</ButtonLink>
      </>,
    );

    const button = screen.getByRole("button", { name: "Salvar" });
    const link = screen.getByRole("link", { name: "Bazar" });
    expect(link.className).toBe(button.className);
    expect(button).toBeDisabled();
    expect(link).not.toHaveAttribute("disabled");
    expect(link).not.toHaveAttribute("emphasis");
    expect(button).not.toHaveAttribute("emphasis");
  });
});
