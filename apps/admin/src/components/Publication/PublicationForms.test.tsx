import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { expect, test, vi } from "vitest";
import { DogForm } from "../DogForm";
import { RecycleForm } from "../RecycleForm";
import { dogEntitySchema } from "../../../shared/entities";

test("a dog draft saves missing details and publication lists the pending fields", async () => {
  const user = userEvent.setup();
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  render(<MemoryRouter><DogForm title="Novo cão" buttonLabel="Cadastrar" onSubmit={onSubmit} /></MemoryRouter>);
  await user.type(screen.getByLabelText(/Nome/), "Nina");
  await user.click(screen.getByRole("button", { name: "Publicar" }));
  expect(onSubmit).not.toHaveBeenCalled();
  expect(screen.getByText(/Informe a idade para publicar/)).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Fechar" }));
  await user.click(screen.getByRole("button", { name: "Salvar rascunho" }));
  await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
    nome: "Nina", publicationStatus: "draft", idade: "", status: "", fotos: [],
  })));
}, 15_000);

test("a point draft can save only its name without the browser requiring an address", async () => {
  const user = userEvent.setup();
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  render(<MemoryRouter><RecycleForm title="Novo ponto" buttonLabel="Cadastrar" onSubmit={onSubmit} /></MemoryRouter>);
  await user.type(screen.getByLabelText("Nome do local"), "Mercado");
  await user.click(screen.getByRole("button", { name: "Salvar rascunho" }));
  await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
    name: "Mercado", publicationStatus: "draft", address: "", neighborhood: "",
  })));
}, 15_000);

test("unpublishing a dog requires confirmation and preserves the saved data", async () => {
  const user = userEvent.setup();
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  const initialData = dogEntitySchema.parse({
    id: 1, documentId: "dog-1", revision: "2026-11-16T12:00:00.000Z", nome: "Nina", publicationStatus: "published", idade: "2 anos", cateIdade: "adulto",
    sexo: "Fêmea", temperamento: "Dócil", status: "Apenas Castrado", cor: "caramelo",
  });
  render(<MemoryRouter><DogForm title="Editar" buttonLabel="Salvar" initialData={initialData} onSubmit={onSubmit} /></MemoryRouter>);
  await user.click(screen.getByRole("button", { name: "Voltar para rascunho" }));
  expect(onSubmit).not.toHaveBeenCalled();
  expect(screen.getByRole("heading", { name: "Voltar para rascunho?" })).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Salvar e retirar do site" }));
  await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
    publicationStatus: "draft", nome: "Nina", status: "Apenas Castrado",
  })));
}, 15_000);
