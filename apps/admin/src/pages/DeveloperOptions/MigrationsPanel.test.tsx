import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { MigrationsPanel } from "./MigrationsPanel";
import { applyMigrationBatch, getMigrations, planMigrationPage } from "../../services/migrations";
import type { MigrationOverview } from "../../../shared/migrations";

vi.mock("../../services/migrations", () => ({
  applyMigrationBatch: vi.fn(), getMigrations: vi.fn(), planMigrationPage: vi.fn(),
}));

const overview: MigrationOverview = {
  project: "production-project", environment: "production", database: "(default)", release: "a".repeat(64),
  migrations: [{ id: "0001-publication-status", description: "Publicação", status: "pending", scanned: 0, changed: 0, attempts: 0, checkpoint: null }],
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getMigrations).mockResolvedValue(overview);
  vi.mocked(planMigrationPage).mockResolvedValue({ counts: [{ id: "0001-publication-status", scanned: 2, changes: 2 }], cursor: null });
  vi.mocked(applyMigrationBatch).mockResolvedValue({ ...overview, migrations: overview.migrations.map(m => ({ ...m, status: "completed", scanned: 2, changed: 2 })) });
});

test("production application requires completed preview and explicit confirmation, then continues bounded calls", async () => {
  vi.mocked(planMigrationPage).mockResolvedValueOnce({ counts: [{ id: "0001-publication-status", scanned: 1, changes: 1 }], cursor: { collectionIndex: 0, after: "dogs/a" } });
  vi.mocked(applyMigrationBatch).mockResolvedValueOnce({ ...overview, migrations: overview.migrations.map(m => ({ ...m, status: "running", scanned: 1, changed: 1 })) });
  render(<MigrationsPanel />);
  expect(await screen.findByText("production-project")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Aplicar / retomar" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Simular migrações" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Aplicar / retomar" })).toBeEnabled());
  expect(planMigrationPage).toHaveBeenCalledTimes(2);
  expect(screen.getByText(/Simulação: 3 examinados/)).toBeInTheDocument();
  expect(applyMigrationBatch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Aplicar / retomar" }));
  expect(screen.getByRole("dialog")).toHaveTextContent("production-project");
  expect(applyMigrationBatch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Aplicar migrações" }));
  await screen.findByText("Migrações concluídas. O histórico foi atualizado.");
  expect(applyMigrationBatch).toHaveBeenCalledTimes(2);
  expect(applyMigrationBatch).toHaveBeenCalledWith(overview, expect.any(AbortSignal));
});

test("a failed batch stops automatic execution and invalidates the confirmation", async () => {
  vi.mocked(applyMigrationBatch).mockRejectedValue(new Error("Outra execução está usando a trava do banco."));
  render(<MigrationsPanel />);
  await screen.findByText("production-project");
  fireEvent.click(screen.getByRole("button", { name: "Simular migrações" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Aplicar / retomar" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Aplicar / retomar" }));
  fireEvent.click(screen.getByRole("button", { name: "Aplicar migrações" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Outra execução");
  expect(applyMigrationBatch).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button", { name: "Aplicar / retomar" })).toBeDisabled();
});

test("unmounting prevents the next batch while preserving the server checkpoint", async () => {
  let resolveBatch: (value: MigrationOverview) => void = () => {};
  vi.mocked(applyMigrationBatch).mockImplementationOnce(() => new Promise(resolve => { resolveBatch = resolve; }));
  const view = render(<MigrationsPanel />);
  await screen.findByText("production-project");
  fireEvent.click(screen.getByRole("button", { name: "Simular migrações" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Aplicar / retomar" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Aplicar / retomar" }));
  fireEvent.click(screen.getByRole("button", { name: "Aplicar migrações" }));
  const signal = vi.mocked(applyMigrationBatch).mock.calls[0][1];
  view.unmount();
  expect(signal?.aborted).toBe(true);
  resolveBatch(overview);
  await Promise.resolve();
  expect(applyMigrationBatch).toHaveBeenCalledTimes(1);
});
