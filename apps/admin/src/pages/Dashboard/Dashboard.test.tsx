import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, expect, test, vi } from "vitest";
import Dashboard from ".";

afterEach(() => vi.restoreAllMocks());

test("overview exposes the support reference and retries only by user action", async () => {
  const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json({ error: {
    code: "DATA_QUERY_FAILED", message: "Não foi possível carregar a visão geral.", requestId: "request-dashboard",
  } }, { status: 500 })).mockResolvedValueOnce(Response.json({
    metrics: { dogs: 0, publishedDogs: 0, recycles: 0, publishedRecycles: 0, adoptions: 0, adoptionsViaSite: 0 },
    expiringAdoptions: [], notification: null,
  }));
  render(<MemoryRouter><Dashboard /></MemoryRouter>);
  expect(await screen.findByRole("alert")).toHaveTextContent("Referência: request-dashboard");
  expect(fetcher).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: /tentar novamente/i }));
  await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  expect(fetcher).toHaveBeenCalledTimes(2);
});
