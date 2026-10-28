import { act, renderHook, screen, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
} from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  VALID_STEP_1,
  VALID_STEP_2,
} from "../../../../test/fixtures/adoption";
import { ADOPTION_IDEMPOTENCY_STORAGE_KEY } from "./submission";
import { useWizardForm } from "./useWizardForm";
import { WIZARD_STORAGE_KEYS } from "./wizardStorage";

function LocationTracker() {
  return <output data-testid="router-location">{useLocation().pathname}</output>;
}

function createRouterWrapper(initialEntry: string) {
  return function RouterWrapper({ children }: PropsWithChildren) {
    return (
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route
            path="/beta/formulario/step/:step"
            element={
              <>
                <LocationTracker />
                {children}
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    );
  };
}

function renderWizardHook(initialEntry = "/beta/formulario/step/1") {
  return renderHook(() => useWizardForm(), {
    wrapper: createRouterWrapper(initialEntry),
  });
}

describe("useWizardForm", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
  });

  it("inicia na primeira etapa com métricas coerentes", () => {
    const { result } = renderWizardHook();

    expect(result.current.currentStep).toBe(0);
    expect(result.current.totalSteps).toBe(10);
    expect(result.current.isFirstStep).toBe(true);
    expect(result.current.isLastStep).toBe(false);
    expect(result.current.progress).toBe(10);
    expect(result.current.formData).toEqual({});
  });

  it("restaura dados e avanço válidos da sessão", () => {
    sessionStorage.setItem(
      WIZARD_STORAGE_KEYS.formData,
      JSON.stringify({ ...VALID_STEP_1, ...VALID_STEP_2 }),
    );
    sessionStorage.setItem(WIZARD_STORAGE_KEYS.highestStep, "1");

    const { result } = renderWizardHook("/beta/formulario/step/2");

    expect(result.current.currentStep).toBe(1);
    expect(result.current.highestCompletedStep).toBe(1);
    expect(result.current.formData.nome_adotante).toBe(
      VALID_STEP_1.nome_adotante,
    );
  });

  it("ignora dados corrompidos salvos na sessão", () => {
    sessionStorage.setItem(WIZARD_STORAGE_KEYS.formData, "{json-inválido");

    const { result } = renderWizardHook();

    expect(result.current.formData).toEqual({});
  });

  it("continua funcional quando a leitura do storage não está disponível", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage indisponível");
    });

    const { result } = renderWizardHook();

    expect(result.current.formData).toEqual({});
    expect(result.current.highestCompletedStep).toBe(0);
  });

  it.each(["abc", "0", "11", "02", "2abc"])(
    "normaliza o parâmetro de etapa inválido %s",
    async (step) => {
      sessionStorage.setItem(WIZARD_STORAGE_KEYS.highestStep, "9");
      renderWizardHook(`/beta/formulario/step/${step}`);

      await waitFor(() =>
        expect(screen.getByTestId("router-location")).toHaveTextContent(
          "/beta/formulario/step/1",
        ),
      );
    },
  );

  it("impede acesso direto a uma etapa ainda não liberada", async () => {
    renderWizardHook("/beta/formulario/step/4");

    await waitFor(() =>
      expect(screen.getByTestId("router-location")).toHaveTextContent(
        "/beta/formulario/step/1",
      ),
    );
  });

  it("expõe erros da etapa e remove apenas o erro do campo alterado", () => {
    const { result } = renderWizardHook();

    act(() => {
      expect(result.current.validateCurrentStep()).toBe(false);
    });

    expect(result.current.errors.nome_adotante).toBeDefined();
    expect(result.current.errors.email).toBeDefined();

    act(() => {
      result.current.updateField("nome_adotante", "Pessoa atualizada");
    });

    expect(result.current.formData.nome_adotante).toBe("Pessoa atualizada");
    expect(result.current.errors.nome_adotante).toBeUndefined();
    expect(result.current.errors.email).toBeDefined();
  });

  it("avança somente após validar e persiste a etapa liberada", async () => {
    sessionStorage.setItem(
      WIZARD_STORAGE_KEYS.formData,
      JSON.stringify(VALID_STEP_1),
    );
    const { result } = renderWizardHook();

    act(() => result.current.nextStep());

    await waitFor(() => {
      expect(screen.getByTestId("router-location")).toHaveTextContent(
        "/beta/formulario/step/2",
      );
      expect(result.current.highestCompletedStep).toBe(1);
    });
    expect(window.scrollTo).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(WIZARD_STORAGE_KEYS.highestStep)).toBe("1");
  });

  it("permanece na etapa quando a validação falha", () => {
    const { result } = renderWizardHook();

    act(() => result.current.nextStep());

    expect(screen.getByTestId("router-location")).toHaveTextContent(
      "/beta/formulario/step/1",
    );
    expect(result.current.highestCompletedStep).toBe(0);
    expect(result.current.errors.nome_adotante).toBeDefined();
    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it("volta e navega apenas entre etapas já liberadas", async () => {
    sessionStorage.setItem(WIZARD_STORAGE_KEYS.highestStep, "3");
    const { result } = renderWizardHook("/beta/formulario/step/2");

    act(() => result.current.prevStep());
    await waitFor(() =>
      expect(screen.getByTestId("router-location")).toHaveTextContent(
        "/beta/formulario/step/1",
      ),
    );

    act(() => result.current.goToStep(2));
    await waitFor(() =>
      expect(screen.getByTestId("router-location")).toHaveTextContent(
        "/beta/formulario/step/3",
      ),
    );

    act(() => result.current.goToStep(7));
    expect(screen.getByTestId("router-location")).toHaveTextContent(
      "/beta/formulario/step/3",
    );
  });

  it("descarta um avanço persistido inválido", () => {
    sessionStorage.setItem(WIZARD_STORAGE_KEYS.highestStep, "valor-inválido");

    const { result } = renderWizardHook();

    expect(result.current.highestCompletedStep).toBe(0);
  });

  it("reinicia o estado e remove a chave de idempotência", async () => {
    sessionStorage.setItem(
      WIZARD_STORAGE_KEYS.formData,
      JSON.stringify(VALID_STEP_1),
    );
    sessionStorage.setItem(WIZARD_STORAGE_KEYS.highestStep, "2");
    sessionStorage.setItem(ADOPTION_IDEMPOTENCY_STORAGE_KEY, "submission-key");
    const { result } = renderWizardHook("/beta/formulario/step/2");

    act(() => result.current.resetForm());

    await waitFor(() => {
      expect(screen.getByTestId("router-location")).toHaveTextContent(
        "/beta/formulario/step/1",
      );
      expect(result.current.formData).toEqual({});
      expect(result.current.highestCompletedStep).toBe(0);
    });
    expect(
      sessionStorage.getItem(ADOPTION_IDEMPOTENCY_STORAGE_KEY),
    ).toBeNull();
  });
});
