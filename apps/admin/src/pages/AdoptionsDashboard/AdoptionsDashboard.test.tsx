import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import AdoptionsDashboard from ".";
import { getAdoptionApplications, updateAdoptionStatus } from "../../services/adoptions";

vi.mock("../../services/adoptions", () => ({
  getAdoptionApplications: vi.fn(),
  getAdoptionApplication: vi.fn(),
  updateAdoptionStatus: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getAdoptionApplications).mockResolvedValue([{
    id: "application-1", nome_adotante: "Lívia", status: "approved",
    submittedAt: new Date(Date.now() - 86400000).toISOString(),
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
  }]);
});

test("reconsideration requires confirmation and keeps the first decision deadline", async () => {
  const expiresAt = new Date(Date.now() + 86400000).toISOString();
  vi.mocked(updateAdoptionStatus).mockResolvedValue({ ok: true, status: "pending", expiresAt });
  render(<AdoptionsDashboard />);
  fireEvent.click(await screen.findByRole("button", { name: "Reconsiderar" }));
  expect(screen.getByText(/mantendo o prazo de exclusão definido pela primeira decisão/)).toBeInTheDocument();
  expect(updateAdoptionStatus).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Sim, reconsiderar" }));
  await waitFor(() => expect(updateAdoptionStatus).toHaveBeenCalledWith("application-1", "pending"));
  fireEvent.click(await screen.findByRole("button", { name: "Continuar" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Revisar solicitação de Lívia" })).toBeInTheDocument());
  expect(screen.queryByRole("button", { name: "Reconsiderar" })).not.toBeInTheDocument();
  expect(screen.getByText("Expira amanhã")).toBeInTheDocument();
});

test("an expired completed application cannot be reconsidered", async () => {
  vi.mocked(getAdoptionApplications).mockResolvedValue([{
    id: "expired", nome_adotante: "Lívia", status: "rejected",
    expiresAt: new Date(Date.now() - 86400000).toISOString(),
  }]);
  render(<AdoptionsDashboard />);
  await screen.findByRole("button", { name: "Consultar análise de Lívia" });
  expect(screen.queryByRole("button", { name: "Reconsiderar" })).not.toBeInTheDocument();
});
