import * as React from "react";
import { useSearchParams } from "react-router";

import * as Step from "./steps";
import { STEP_TITLES, useWizardForm, WIZARD_STORAGE_ERROR } from "./useWizardForm";
import type { FormData } from "./schema";

import { Button, ButtonLink } from "@jaci/ui/Button";
import * as CardComponent from "@jaci/ui/Card";
import * as DialogComponent from "@jaci/ui/Dialog";
import * as Lucide from "lucide-react";

import { ExternalLink } from "@/components/common/ExternalLink";
import { useIsDesktop } from "@/hooks/useIsDesktop";
import { SAMPLE_ADOPTION_FORM_DATA } from "@/mocks/adoption";
import {
  clearIdempotencyKey,
  sendAdoptionApplication,
  getOrCreateIdempotencyKey,
  type AdoptionSubmissionResult,
} from "./submission";
import {
  executeAdoptionRecaptcha,
  isAdoptionRecaptchaBypassed,
  loadRecaptcha,
} from "./recaptcha";
import { WIZARD_STORAGE_KEYS } from "./wizardStorage";

import styles from "./WizardForm.module.css";

const INTRO_WARNINGS = [
  {
    title: "Uma decisão para toda a vida",
    items: [
      <>
        Avalie se você tem <strong>tempo, paciência, disponibilidade,</strong>{" "}
        condições financeiras e disposição para cuidar do animal em todas as
        fases da vida.
      </>,
      <>
        Mudanças de residência, relacionamento, filhos, viagens, trabalho,
        rotina, saúde ou situação financeira não devem resultar em abandono ou
        devolução.
      </>,
      <>
        A adaptação exige dedicação. Cada animal tem seu próprio tempo e precisa
        de paciência, compreensão e constância para se sentir seguro.
      </>,
      <>
        Animais geram gastos com alimentação, higiene e veterinário. Também
        fazem sujeira, perdem pelos e podem latir ou miar.
      </>,
    ],
  },
  {
    title: "Como funciona o processo",
    items: [
      <>
        O preenchimento deste questionário <strong>não garante a adoção.</strong>{" "}
        A equipe avaliará a compatibilidade entre o perfil da família e as
        necessidades, características e temperamento do animal.
      </>,
      <>
        Candidatos com perfil compatível serão contatados para uma entrevista,
        etapa essencial para conhecer melhor a família e esclarecer dúvidas.
      </>,
      <>
        Preencha tudo com atenção. Respostas incompletas, inconsistentes ou que
        não atendam ao solicitado poderão desclassificar a candidatura.
      </>,
      <>
        Se a adoção ou guarda for aprovada, suas respostas serão anexadas ao
        Termo de Responsabilidade ou ao Termo de Guarda Provisória.
      </>,
    ],
  },
  {
    title: "Quem será responsável",
    items: [
      <>
        É obrigatório ter <strong>18 anos ou mais</strong> para adotar. Alguns
        protetores realizam adoções somente para pessoas com no mínimo 25 anos.
      </>,
      <>
        Quando a adoção for feita por um casal, os dados de ambos devem constar
        no questionário e os dois assumirão a responsabilidade pelo animal.
      </>,
      <>
        Se houver mais de um responsável, informe os dados de ambos nas questões
        1 a 7. Responsável é quem cuidará do animal até o fim da vida, inclusive
        financeiramente.
      </>,
      <>Crianças não são consideradas responsáveis pela adoção.</>,
    ],
  },
  {
    title: "Taxa de adoção",
    items: [
      <>
        A taxa ajuda a custear parte das despesas com resgate, alimentação,
        vacinação, vermifugação, castração e outros cuidados veterinários.
      </>,
      <>
        O abrigo realiza esse trabalho por amor aos animais, sem obrigação
        legal, e depende dessa colaboração para continuar salvando vidas.
      </>,
      <>
        Em regra, a taxa corresponde aproximadamente ao valor de uma castração.
        Alguns animais de raça ou com características específicas poderão ter
        uma taxa diferenciada.
      </>,
    ],
  },
] as const;

const STEP_DESCRIPTIONS = [
  "Vamos começar com seus dados e formas de contato.",
  "Conte um pouco sobre as pessoas que vão conviver com o animal.",
  "Queremos conhecer suas expectativas para a adoção.",
  "Conte como será a rotina e o espaço do animal no seu lar.",
  "Compartilhe suas experiências e os cuidados com outros animais.",
  "Vamos conversar sobre os cuidados ao longo da vida do animal.",
  "Leia os compromissos que fazem parte da adoção responsável.",
  "Conte como você lidaria com estas mudanças na sua vida.",
  "Cada animal tem seu jeito. Conte como você lidaria com estas situações.",
  "Estamos chegando ao fim. Confira as informações desta última etapa.",
];

interface WizardFormProps {
  onSubmitSuccess?: (result: AdoptionSubmissionResult) => void;
  onSubmitError?: (message: string) => void;
  onStorageError?: (message: string) => void;
}

function focusAndScroll(target: HTMLElement, scrollTarget = target) {
  target.focus({ preventScroll: true });
  const header = document.querySelector("header");
  const headerHeight = header && getComputedStyle(header).position === "fixed"
    ? header.getBoundingClientRect().height
    : 0;
  window.scrollTo({
    top: Math.max(0, window.scrollY + scrollTarget.getBoundingClientRect().top - headerHeight - 16),
    behavior: "instant",
  });
}

export function WizardForm({ onSubmitSuccess, onSubmitError, onStorageError }: WizardFormProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [searchParams] = useSearchParams();
  const petName = searchParams.get("pet") || "";
  const isDesktop = useIsDesktop();
  const submissionKeyRef = React.useRef<string | null>(null);
  const submissionLockedRef = React.useRef(false);
  const submissionSucceededRef = React.useRef(false);
  const [warningStep, setWarningStep] = React.useState(0);

  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [showWarning, setShowWarning] = React.useState<boolean>(() => {
    try {
      const saved = sessionStorage.getItem(WIZARD_STORAGE_KEYS.showWarning);
      return saved === null ? true : saved === "true";
    } catch {
      return true;
    }
  });

  const restartConfirmedRef = React.useRef(false);
  const [showRestartDialog, setShowRestartDialog] = React.useState(false);
  const [showResumeNotice, setShowResumeNotice] = React.useState<boolean>(
    () => {
      try {
        const savedData = sessionStorage.getItem(WIZARD_STORAGE_KEYS.formData);
        if (!savedData) return false;
        const savedForm: Partial<FormData> = JSON.parse(savedData);
        return Object.values(savedForm).some(
          (value) => String(value ?? "").trim() !== "",
        );
      } catch {
        return false;
      }
    },
  );

  const {
    currentStep,
    totalSteps,
    isFirstStep,
    isLastStep,
    isSubmitted,
    progress,
    formData,
    storageError,
    errors,
    validationAttempt,
    updateField,
    nextStep,
    prevStep,
    goToStep,
    validateAllSteps,
    highestCompletedStep,
    resetForm,
    completeForm,
    fillFormWithSampleData,
  } = useWizardForm();

  const hasAnswers = Object.values(formData).some(
    (value) => String(value ?? "").trim() !== "",
  );

  React.useEffect(() => {
    const container = containerRef.current;
    const heading = container?.querySelector<HTMLElement>(
      showWarning ? "#warning-title" : "#wizard-step-heading",
    );
    if (container && heading) {
      heading.tabIndex = -1;
      focusAndScroll(heading, container);
    }
  }, [currentStep, warningStep, showWarning]);

  React.useEffect(() => {
    if (validationAttempt === 0) return;
    const field = containerRef.current?.querySelector<HTMLElement>("[data-field-error]");
    const control = field?.querySelector<HTMLElement>(
      'input:not([type="hidden"]), textarea, button, [role="radio"], [tabindex="0"]',
    );
    if (field && control) focusAndScroll(control, field);
  }, [validationAttempt, currentStep]);

  React.useEffect(() => {
    if (isAdoptionRecaptchaBypassed()) return;
    const siteKey = import.meta.env.VITE_RECAPTCHA_PUBLIC_KEY as string;
    return loadRecaptcha(siteKey, (message) => {
      setSubmitError(message);
      onSubmitError?.(message);
    });
  }, [onSubmitError]);

  React.useEffect(() => {
    if (storageError) onStorageError?.(storageError);
  }, [storageError, onStorageError]);

  const handleRestart = () => {
    restartConfirmedRef.current = true;
    resetForm();
    submissionKeyRef.current = null;
    submissionLockedRef.current = false;
    submissionSucceededRef.current = false;
    setSubmitError(null);
    setShowResumeNotice(false);
    setShowRestartDialog(false);
  };

  React.useEffect(() => {
    if (isSubmitted) return;
    try {
      sessionStorage.setItem(
        WIZARD_STORAGE_KEYS.showWarning,
        String(showWarning),
      );
    } catch {
      onStorageError?.(WIZARD_STORAGE_ERROR);
    }
  }, [showWarning, onStorageError, isSubmitted]);

  // pré-preencher nome do pet
  const handleUpdateField = React.useCallback(
    (field: keyof FormData, value: string | number) => {
      updateField(field, value);
    },
    [updateField],
  );

  React.useEffect(() => {
    if (!isSubmitted && petName && !formData.animal_especifico) {
      updateField("animal_especifico", petName);
    }
  }, [petName, formData.animal_especifico, updateField, isSubmitted]);

  const onSubmit = async (e: React.SubmitEvent) => {
    e.preventDefault();
    if (submissionLockedRef.current) return;
    const validatedData = validateAllSteps();
    if (!validatedData) return;
    submissionLockedRef.current = true;
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const siteKey = import.meta.env.VITE_RECAPTCHA_PUBLIC_KEY;

      const token = await executeAdoptionRecaptcha(siteKey);
      const idempotencyKey =
        submissionKeyRef.current ?? getOrCreateIdempotencyKey();
      submissionKeyRef.current = idempotencyKey;

      const submissionResult = await sendAdoptionApplication({ ...validatedData, captchaToken: token }, idempotencyKey);
      submissionSucceededRef.current = true;
      const cleared = completeForm();
      submissionKeyRef.current = null;
      setShowResumeNotice(false);

      if (onSubmitSuccess) {
        onSubmitSuccess({
          ...submissionResult,
          ...(!cleared ? {
            warning: [submissionResult.warning, "A candidatura foi recebida, mas o navegador não permitiu remover o rascunho local. Não reenvie este preenchimento; guarde o ID da candidatura."].filter(Boolean).join(" "),
          } : {}),
        });
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Erro ao enviar formulário. Tente novamente.";
      setSubmitError(message);
      onSubmitError?.(message);
      console.error("Error submitting application:", error);
    } finally {
      if (!submissionSucceededRef.current) submissionLockedRef.current = false;
      setIsSubmitting(false);
    }
  };

  const stepProps = {
    formData,
    errors,
    updateField: handleUpdateField,
  };

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return <Step.Step1DadosPessoais {...stepProps} />;
      case 1:
        return <Step.Step2Familia {...stepProps} />;
      case 2:
        return <Step.Step3Adocao {...stepProps} />;
      case 3:
        return <Step.Step4Moradia {...stepProps} />;
      case 4:
        return <Step.Step5Historico {...stepProps} />;
      case 5:
        return <Step.Step6Responsabilidades {...stepProps} />;
      case 6:
        return <Step.Step7Termos {...stepProps} />;
      case 7:
        return <Step.Step8Hipoteticas {...stepProps} />;
      case 8:
        return <Step.Step9Situacoes {...stepProps} />;
      case 9:
        return <Step.Step10Finalizacao {...stepProps} />;

      default:
        return null;
    }
  };

  if (showWarning) {
    const warning = INTRO_WARNINGS[warningStep];
    const isLastWarning = warningStep === INTRO_WARNINGS.length - 1;
    const warningProgress = ((warningStep + 1) / INTRO_WARNINGS.length) * 100;

    return (
      <div className={styles.wizardContainer} ref={containerRef}>
        <header className={styles.warningHeader}>
          <h2>Leia com atenção</h2>
          <p>
            Estes quatro pontos ajudam você a entender o compromisso e o
            processo de adoção.
          </p>
        </header>

        <div className={styles.warningProgress}>
          <div className={styles.warningProgressInfo}>
            <span>
              Antes de começar · {warningStep + 1} de {INTRO_WARNINGS.length}
            </span>
          </div>
          <div
            className={styles.warningProgressTrack}
            role="progressbar"
            aria-label="Progresso dos avisos iniciais"
            aria-valuemin={0}
            aria-valuemax={INTRO_WARNINGS.length}
            aria-valuenow={warningStep + 1}
          >
            <div
              className={styles.warningProgressFill}
              style={{ width: `${warningProgress}%` }}
            />
          </div>
        </div>

        <div aria-live="polite">
          <CardComponent.Card
            key={warningStep}
            variant="callout"
            tone="muted"
            size="md"
            className={styles.warningCard}
          >
            <CardComponent.CardBody className={styles.warningCardBody}>
              <CardComponent.CardHeader className={styles.warningCardHeader}>
                <CardComponent.CardTitle id="warning-title" className={styles.warningCardTitle}>
                  {warning.title}
                </CardComponent.CardTitle>
              </CardComponent.CardHeader>
              <CardComponent.CardContent>
                <ul
                  className={styles.warningList}
                  aria-labelledby="warning-title"
                >
                  {warning.items.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              </CardComponent.CardContent>
            </CardComponent.CardBody>
          </CardComponent.Card>
        </div>

        <div className={styles.warningActions}>
          <ButtonLink
            href="/caes"
            variant="outline"
            size={isDesktop ? "lg" : "md"}
            className={styles.warningExit}
          >
            Sair do formulário
          </ButtonLink>
          <div className={styles.warningNavigation}>
            {warningStep > 0 && (
              <Button
                type="button"
                size={isDesktop ? "lg" : "md"}
                variant="secondary"
                onClick={() => setWarningStep((step) => step - 1)}
                leftIcon={<Lucide.ArrowLeft size={18} />}
              >
                Anterior
              </Button>
            )}

            <Button
              type="button"
              size={isDesktop ? "lg" : "md"}
              onClick={() => {
                if (isLastWarning) {
                  setShowWarning(false);
                  return;
                }

                setWarningStep((step) => step + 1);
              }}
              rightIcon={
                isLastWarning ? (
                  <Lucide.Check size={18} />
                ) : (
                  <Lucide.ArrowRight size={18} />
                )
              }
            >
              {isLastWarning ? "Estou ciente e quero continuar" : "Próximo"}
            </Button>
          </div>
        </div>

        {isLastWarning && (
          <div className={styles.privacyDisclaimer}>
            <p>
              Ao clicar em "Estou ciente e quero continuar", você concorda com
              nossa{" "}
              <ExternalLink href="/politica-de-privacidade">
                política de privacidade
              </ExternalLink>
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <DialogComponent.Dialog open={showRestartDialog} onOpenChange={setShowRestartDialog}>
      <div className={styles.wizardContainer} ref={containerRef}>
        {import.meta.env.PUBLIC_DEV_TOOLS && (
          <div className={styles.sampleDataAction}>
            <p id="sample-data-description">
              Atalho local para percorrer as etapas com respostas fictícias.
            </p>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              leftIcon={<Lucide.TestTube size={16} />}
              aria-describedby="sample-data-description"
              onClick={() => {
                clearIdempotencyKey();
                submissionKeyRef.current = null;
                setSubmitError(null);
                fillFormWithSampleData(SAMPLE_ADOPTION_FORM_DATA);
              }}
            >
              Preencher com dados fictícios
            </Button>
          </div>
        )}

        <header className={styles.stepHeader}>
          <p className={styles.stepEyebrow}>Etapa {currentStep + 1} de {totalSteps}</p>
          <h2
            id="wizard-step-heading"
            className={styles.stepHeading}
            tabIndex={-1}
            aria-label={`Etapa ${currentStep + 1} de ${totalSteps}: ${STEP_TITLES[currentStep].label}`}
          >
            {STEP_TITLES[currentStep].label}
          </h2>
          <p className={styles.stepDescription}>{STEP_DESCRIPTIONS[currentStep]}</p>
          <div
            className={styles.progressTrack}
            role="progressbar"
            aria-label="Progresso das etapas do formulário de adoção"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress)}
            aria-valuetext={`Etapa ${currentStep + 1} de ${totalSteps}`}
          >
            <div className={styles.progressFill} style={{ width: `${progress}%` }} />
          </div>
          {highestCompletedStep > 0 && (
            <details key={currentStep} className={styles.stepReview}>
              <summary>Navegar pelas etapas</summary>
              <nav aria-label="Etapas do formulário de adoção">
                {STEP_TITLES.map(({ label }, index) => (
                  <Button
                    key={label}
                    type="button"
                    size="sm"
                    variant={index === currentStep ? "secondary" : "ghost"}
                    disabled={index > highestCompletedStep}
                    aria-current={index === currentStep ? "step" : undefined}
                    onClick={() => goToStep(index)}
                    leftIcon={
                      index < highestCompletedStep && index !== currentStep
                        ? <Lucide.Check size={16} />
                        : undefined
                    }
                  >
                    {index + 1}. {label}
                  </Button>
                ))}
              </nav>
            </details>
          )}
          {hasAnswers && (
            <div className={styles.formActions}>
              {showResumeNotice && (
                <p role="status" className={styles.resumeNotice}>
                  <Lucide.RotateCcw size={16} aria-hidden="true" />
                  Retomamos seu preenchimento nesta aba.
                </p>
              )}
              <DialogComponent.DialogTrigger asChild>
                <Button
                  type="button"
                  variant="text"
                  size="sm"
                  disabled={isSubmitting || isSubmitted}
                >
                  Começar novo formulário
                </Button>
              </DialogComponent.DialogTrigger>
            </div>
          )}
        </header>
        <section key={currentStep} aria-labelledby="wizard-step-heading">
          {/* Form Content */}
          <form onSubmit={onSubmit}>
            {renderStep()}

            {/* Error summary */}
            {Object.keys(errors).length > 0 && (
              <div className={styles.errorSummary}>
                <Lucide.AlertTriangle size={18} />
                <span>Preencha todos os campos obrigatórios antes de avançar.</span>
              </div>
            )}

            {submitError && (
              <div
                className={styles.submitError}
                role="alert"
                aria-live="assertive"
              >
                <Lucide.CircleAlert size={18} />
                <span>{submitError}</span>
              </div>
            )}

            {/* Navigation */}
            <div className={styles.navigation}>
              {!isFirstStep && (
                <Button
                  type="button"
                  variant="secondary"
                  size={isDesktop ? "lg" : "md"}
                  onClick={prevStep}
                  leftIcon={<Lucide.ArrowLeft size={22} />}
                >
                  Anterior
                </Button>
              )}

              <div className={styles.navigationSpacer} />

              {!isLastStep ? (
                <Button
                  type="button"
                  size={isDesktop ? "lg" : "md"}
                  onClick={nextStep}
                  rightIcon={<Lucide.ArrowRight size={22} />}
                >
                  Próximo
                </Button>
              ) : (
                <Button
                  type="submit"
                  size={isDesktop ? "lg" : "md"}
                  disabled={isSubmitting || isSubmitted}
                  rightIcon={<Lucide.Send size={22} />}
                >
                  {isSubmitting ? "Enviando..." : "Enviar Respostas"}
                </Button>
              )}
            </div>
          </form>
        </section>

        <DialogComponent.DialogContent
          size="sm"
          onCloseAutoFocus={(event) => {
            if (!restartConfirmedRef.current) return;
            event.preventDefault();
            restartConfirmedRef.current = false;
            const heading = containerRef.current?.querySelector<HTMLElement>("#wizard-step-heading");
            if (heading) focusAndScroll(heading);
          }}
        >
          <DialogComponent.DialogHeader>
            <DialogComponent.DialogIcon tone="warning">
              <Lucide.RotateCcw />
            </DialogComponent.DialogIcon>
            <DialogComponent.DialogHeading>
              <DialogComponent.DialogTitle>
                Começar um novo formulário?
              </DialogComponent.DialogTitle>
              <DialogComponent.DialogDescription>
                Isso apagará todas as respostas deste preenchimento e voltará
                à primeira etapa. Essa ação não pode ser desfeita.
              </DialogComponent.DialogDescription>
            </DialogComponent.DialogHeading>
          </DialogComponent.DialogHeader>
          <DialogComponent.DialogFooter className={styles.dialogFooter}>
            <Button type="button" variant="outline" onClick={() => setShowRestartDialog(false)}>
              Continuar preenchendo
            </Button>
            <Button type="button" variant="danger" onClick={handleRestart}>
              Apagar respostas e recomeçar
            </Button>
          </DialogComponent.DialogFooter>
        </DialogComponent.DialogContent>
      </div>
    </DialogComponent.Dialog>
  );
}
