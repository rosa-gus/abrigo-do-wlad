import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router";

import { useIsDesktop } from "@/hooks/useIsDesktop";

import { VALID_ADOPTION_APPLICATION } from "../../../../test/fixtures/adoption";
import {
  ADOPTION_RECAPTCHA_ACTION,
  RECAPTCHA_SCRIPT_ID,
} from "./recaptcha";
import { ADOPTION_IDEMPOTENCY_STORAGE_KEY } from "./submission";
import { WizardForm } from ".";
import { WIZARD_STORAGE_KEYS } from "./wizardStorage";

vi.mock("@/hooks/useIsDesktop", () => ({
  useIsDesktop: vi.fn(() => false),
}));

function renderWizard(
  initialEntry = "/beta/formulario/step/1",
  onSubmitSuccess = vi.fn(),
) {
  const view = render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route
          path="/beta/formulario/step/:step"
          element={<WizardForm onSubmitSuccess={onSubmitSuccess} />}
        />
      </Routes>
    </MemoryRouter>,
  );

  return { ...view, onSubmitSuccess };
}

function installRecaptcha(token = "captcha-token") {
  const execute = vi.fn().mockResolvedValue(token);
  const ready = vi.fn((callback: () => void) => callback());
  vi.stubGlobal("grecaptcha", { ready, execute });
  return { ready, execute };
}

function prepareLastStep() {
  sessionStorage.setItem(
    WIZARD_STORAGE_KEYS.formData,
    JSON.stringify(VALID_ADOPTION_APPLICATION),
  );
  sessionStorage.setItem(WIZARD_STORAGE_KEYS.highestStep, "9");
}

describe("WizardForm", () => {
  beforeEach(() => {
    sessionStorage.clear();
    sessionStorage.setItem(WIZARD_STORAGE_KEYS.showWarning, "false");
    sessionStorage.setItem(WIZARD_STORAGE_KEYS.dialogShown, "true");
    vi.mocked(useIsDesktop).mockReturnValue(false);
    vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
  });

  afterEach(() => {
    document.getElementById(RECAPTCHA_SCRIPT_ID)?.remove();
  });

  it("remove o reCAPTCHA ao sair do wizard e o recarrega ao voltar", () => {
    const firstView = renderWizard();
    const badge = document.createElement("div");
    badge.className = "grecaptcha-badge";
    document.body.appendChild(badge);

    const runtimeScript = document.createElement("script");
    runtimeScript.src =
      "https://www.gstatic.com/recaptcha/releases/test/recaptcha__pt_br.js";
    document.head.appendChild(runtimeScript);

    expect(document.getElementById(RECAPTCHA_SCRIPT_ID)).toBeInTheDocument();
    expect(document.querySelector(".grecaptcha-badge")).toBeInTheDocument();

    firstView.unmount();

    expect(document.getElementById(RECAPTCHA_SCRIPT_ID)).not.toBeInTheDocument();
    expect(document.querySelector(".grecaptcha-badge")).not.toBeInTheDocument();
    expect(runtimeScript).not.toBeInTheDocument();

    const secondView = renderWizard();
    expect(document.getElementById(RECAPTCHA_SCRIPT_ID)).toBeInTheDocument();
    secondView.unmount();
  });

  it("exibe os quatro avisos iniciais e persiste a decisão de prosseguir", async () => {
    sessionStorage.removeItem(WIZARD_STORAGE_KEYS.showWarning);
    const user = userEvent.setup();

    renderWizard();

    expect(screen.getByText("Uma decisão para toda a vida")).toBeInTheDocument();
    expect(screen.getByText("Aviso 1 de 4")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Próximo" }));
    expect(screen.getByText("Como funciona o processo")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Próximo" }));
    expect(screen.getByText("Quem será responsável")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Próximo" }));
    expect(screen.getByText("Taxa de adoção")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Anterior" }));
    expect(screen.getByText("Quem será responsável")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Próximo" }));

    await user.click(
      screen.getByRole("button", { name: /Estou ciente e quero continuar/ }),
    );

    expect(screen.getByText("Dados Pessoais")).toBeInTheDocument();
    await waitFor(() =>
      expect(sessionStorage.getItem(WIZARD_STORAGE_KEYS.showWarning)).toBe(
        "false",
      ),
    );
  });

  it("permite continuar um preenchimento salvo", async () => {
    sessionStorage.setItem(
      WIZARD_STORAGE_KEYS.formData,
      JSON.stringify(VALID_ADOPTION_APPLICATION),
    );
    sessionStorage.removeItem(WIZARD_STORAGE_KEYS.dialogShown);
    const user = userEvent.setup();

    renderWizard();

    expect(screen.getByText("Continuar preenchimento?")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Continuar preenchimento" }),
    );

    await waitFor(() =>
      expect(
        screen.queryByText("Continuar preenchimento?"),
      ).not.toBeInTheDocument(),
    );
    expect(sessionStorage.getItem(WIZARD_STORAGE_KEYS.dialogShown)).toBe(
      "true",
    );
  });

  it("permite descartar o preenchimento salvo e começar novamente", async () => {
    sessionStorage.setItem(
      WIZARD_STORAGE_KEYS.formData,
      JSON.stringify(VALID_ADOPTION_APPLICATION),
    );
    sessionStorage.setItem(ADOPTION_IDEMPOTENCY_STORAGE_KEY, "saved-key");
    sessionStorage.removeItem(WIZARD_STORAGE_KEYS.dialogShown);
    const user = userEvent.setup();

    renderWizard();
    await user.click(
      screen.getByRole("button", { name: "Começar um novo" }),
    );

    await waitFor(() =>
      expect(
        screen.queryByText("Continuar preenchimento?"),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByLabelText(/Nome do adotante/)).toHaveValue("");
    expect(
      sessionStorage.getItem(ADOPTION_IDEMPOTENCY_STORAGE_KEY),
    ).toBeNull();
  });

  it("pré-preenche o animal recebido pela URL", async () => {
    sessionStorage.setItem(WIZARD_STORAGE_KEYS.highestStep, "2");

    renderWizard("/beta/formulario/step/3?pet=Amora");

    expect(
      await screen.findByLabelText(/Animal específico/),
    ).toHaveValue("Amora");
  });

  it("troca a etapa renderizada após uma validação bem-sucedida", async () => {
    sessionStorage.setItem(
      WIZARD_STORAGE_KEYS.formData,
      JSON.stringify(VALID_ADOPTION_APPLICATION),
    );
    const user = userEvent.setup();

    renderWizard();
    await user.click(screen.getByRole("button", { name: /Próximo/ }));

    expect(await screen.findByText("Família e Renda")).toBeInTheDocument();
    expect(screen.getByText("Etapa 2 de 10")).toBeInTheDocument();
  });

  it("bloqueia o envio quando a última etapa é inválida", async () => {
    sessionStorage.setItem(WIZARD_STORAGE_KEYS.highestStep, "9");
    const { execute } = installRecaptcha();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    renderWizard("/beta/formulario/step/10");
    await user.click(screen.getByRole("button", { name: /Enviar Respostas/ }));

    expect(
      screen.getByText(/Preencha todos os campos obrigatórios/),
    ).toBeInTheDocument();
    expect(execute).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("informa quando o reCAPTCHA não está disponível", async () => {
    prepareLastStep();
    vi.stubGlobal("grecaptcha", undefined);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const user = userEvent.setup();

    renderWizard("/beta/formulario/step/10");
    await user.click(screen.getByRole("button", { name: /Enviar Respostas/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "reCAPTCHA não carregou corretamente.",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("envia em desenvolvimento sem carregar ou executar reCAPTCHA", async () => {
    vi.stubGlobal("__ADOPTION_RECAPTCHA_BYPASS__", true);
    prepareLastStep();
    vi.stubGlobal("grecaptcha", undefined);
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({ data: { id: "local-application" } }, { status: 201 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const { onSubmitSuccess } = renderWizard("/beta/formulario/step/10");

    expect(document.getElementById(RECAPTCHA_SCRIPT_ID)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Enviar Respostas/ }));

    await waitFor(() =>
      expect(onSubmitSuccess).toHaveBeenCalledWith({
        applicationId: "local-application",
      }),
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).captchaToken).toBe("");
  });

  it("envia o payload validado com CAPTCHA e chave de idempotência", async () => {
    prepareLastStep();
    const { execute } = installRecaptcha("captcha-final");
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json(
        { message: "Created", data: { id: "application-123" } },
        { status: 201 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const onSubmitSuccess = vi.fn();
    const user = userEvent.setup();

    renderWizard("/beta/formulario/step/10", onSubmitSuccess);
    await user.click(screen.getByRole("button", { name: /Enviar Respostas/ }));

    await waitFor(() =>
      expect(onSubmitSuccess).toHaveBeenCalledWith({
        applicationId: "application-123",
      }),
    );
    expect(execute).toHaveBeenCalledWith(expect.any(String), {
      action: ADOPTION_RECAPTCHA_ACTION,
    });

    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = request.headers as Record<string, string>;
    const body = JSON.parse(request.body as string) as Record<string, unknown>;

    expect(headers["Idempotency-Key"]).toEqual(expect.any(String));
    expect(body.nome_adotante).toBe(
      VALID_ADOPTION_APPLICATION.nome_adotante,
    );
    expect(body.captchaToken).toBe("captcha-final");
    expect(
      sessionStorage.getItem(ADOPTION_IDEMPOTENCY_STORAGE_KEY),
    ).toBeNull();
  });

  it("reutiliza a chave de idempotência ao tentar novamente após uma falha", async () => {
    prepareLastStep();
    installRecaptcha();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ message: "Falha temporária" }, { status: 503 }),
      )
      .mockResolvedValueOnce(
        Response.json(
          { message: "Created", data: { id: "application-retry" } },
          { status: 201 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const onSubmitSuccess = vi.fn();
    const user = userEvent.setup();

    renderWizard("/beta/formulario/step/10", onSubmitSuccess);
    const submit = screen.getByRole("button", { name: /Enviar Respostas/ });

    await user.click(submit);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Falha temporária",
    );
    await user.click(submit);

    await waitFor(() =>
      expect(onSubmitSuccess).toHaveBeenCalledWith({
        applicationId: "application-retry",
      }),
    );

    const firstHeaders = fetchMock.mock.calls[0][1]
      .headers as Record<string, string>;
    const secondHeaders = fetchMock.mock.calls[1][1]
      .headers as Record<string, string>;
    expect(secondHeaders["Idempotency-Key"]).toBe(
      firstHeaders["Idempotency-Key"],
    );
  });
});
