import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import AdoptionsDashboard from ".";
import { getAdoptionApplication, getAdoptionApplicationsPage, updateAdoptionStatus } from "../../services/adoptions";
import { ApiError } from "../../services/api";

vi.mock("../../services/adoptions", () => ({
  getAdoptionApplicationsPage: vi.fn(),
  getAdoptionApplication: vi.fn(),
  updateAdoptionStatus: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getAdoptionApplicationsPage).mockResolvedValue({ items: [{
    revision: "2026-11-16T10:00:00.123456Z",
    id: "application-1", nome_adotante: "Lívia", status: "approved",
    submittedAt: new Date(Date.now() - 86400000).toISOString(),
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
  }], nextCursor: null });
});

test("reconsideration requires confirmation and keeps the first decision deadline", async () => {
  const expiresAt = new Date(Date.now() + 86400000).toISOString();
  vi.mocked(updateAdoptionStatus).mockResolvedValue({ ok: true, status: "pending", expiresAt });
  render(<AdoptionsDashboard />);
  fireEvent.click(await screen.findByRole("button", { name: "Reconsiderar" }));
  expect(screen.getByText(/mantendo o prazo de exclusão definido pela primeira decisão/)).toBeInTheDocument();
  expect(updateAdoptionStatus).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Sim, reconsiderar" }));
  await waitFor(() => expect(updateAdoptionStatus).toHaveBeenCalledWith("application-1", "pending", "2026-11-16T10:00:00.123456Z"));
  fireEvent.click(await screen.findByRole("button", { name: "Continuar" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Revisar solicitação de Lívia" })).toBeInTheDocument());
  expect(screen.queryByRole("button", { name: "Reconsiderar" })).not.toBeInTheDocument();
  expect(screen.getByText("Expira amanhã")).toBeInTheDocument();
}, 15_000);

test("an expired completed application cannot be reconsidered", async () => {
  vi.mocked(getAdoptionApplicationsPage).mockResolvedValue({ items: [{
    id: "expired", nome_adotante: "Lívia", status: "rejected",
    expiresAt: new Date(Date.now() - 86400000).toISOString(),
  }], nextCursor: null });
  render(<AdoptionsDashboard />);
  await screen.findByRole("button", { name: "Consultar análise de Lívia" });
  expect(screen.queryByRole("button", { name: "Reconsiderar" })).not.toBeInTheDocument();
});

test("a stale adoption decision requires reloading and never retries automatically", async () => {
  vi.mocked(updateAdoptionStatus).mockRejectedValue(new ApiError(412, "O registro mudou. Recarregue e revise."));
  render(<AdoptionsDashboard />);
  fireEvent.click(await screen.findByRole("button", { name: "Reconsiderar" }));
  fireEvent.click(screen.getByRole("button", { name: "Sim, reconsiderar" }));
  await screen.findByText("O registro mudou. Recarregue e revise.");
  expect(screen.getByRole("button", { name: "Recarregar e revisar" })).toBeInTheDocument();
  expect(updateAdoptionStatus).toHaveBeenCalledTimes(1);
  expect(updateAdoptionStatus).toHaveBeenCalledWith("application-1", "pending", "2026-11-16T10:00:00.123456Z");
  expect(screen.queryByText("Solicitação reaberta")).not.toBeInTheDocument();
});

test("decisions made from the detail use its fresh revision instead of the older list revision", async () => {
  vi.mocked(getAdoptionApplication).mockResolvedValue({
    id: "application-1", nome_adotante: "Lívia", status: "approved",
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    revision: "2026-11-16T11:00:00.654321Z",
  });
  vi.mocked(updateAdoptionStatus).mockResolvedValue({ ok: true, status: "pending", expiresAt: new Date(Date.now() + 86400000).toISOString(), revision: "2026-11-16T12:00:00.654321Z" });
  render(<AdoptionsDashboard />);
  fireEvent.click(await screen.findByRole("button", { name: "Consultar análise de Lívia" }));
  await screen.findByText("Análise concluída");
  fireEvent.click(screen.getByRole("button", { name: "Reconsiderar" }));
  fireEvent.click(screen.getByRole("button", { name: "Sim, reconsiderar" }));
  await waitFor(() => expect(updateAdoptionStatus).toHaveBeenCalledWith("application-1", "pending", "2026-11-16T11:00:00.654321Z"));
}, 15_000);

test("reopening a detail always revalidates access and does not reuse expired cached plaintext", async () => {
  vi.mocked(getAdoptionApplication).mockResolvedValueOnce({
    id: "application-1", nome_adotante: "Lívia", status: "approved",
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    revision: "2026-11-16T11:00:00.654321Z",
  }).mockRejectedValueOnce(new ApiError(404, "Adoption application not found."));
  render(<AdoptionsDashboard />);
  fireEvent.click(await screen.findByRole("button", { name: "Consultar análise de Lívia" }));
  await screen.findByText("Análise concluída");
  fireEvent.click(screen.getByRole("button", { name: "Fechar diálogo" }));
  fireEvent.click(await screen.findByRole("button", { name: "Consultar análise de Lívia" }));
  await screen.findByText("Adoption application not found.");
  expect(getAdoptionApplication).toHaveBeenCalledTimes(2);
  expect(screen.queryByText("Análise concluída")).not.toBeInTheDocument();
});

test("loads the next cursor only after an explicit action, including an empty first window", async () => {
  vi.mocked(getAdoptionApplicationsPage)
    .mockResolvedValueOnce({ items: [], nextCursor: "next-window" })
    .mockResolvedValueOnce({ items: [{
      id: "application-2", nome_adotante: "Joana", status: "pending",
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    }], nextCursor: null });
  render(<AdoptionsDashboard />);
  const next = await screen.findByRole("button", { name: "Carregar mais solicitações" });
  expect(getAdoptionApplicationsPage).toHaveBeenCalledTimes(1);
  fireEvent.click(next);
  await screen.findByRole("button", { name: "Revisar solicitação de Joana" });
  expect(getAdoptionApplicationsPage).toHaveBeenLastCalledWith("next-window");
  expect(screen.queryByRole("button", { name: "Carregar mais solicitações" })).not.toBeInTheDocument();
});
