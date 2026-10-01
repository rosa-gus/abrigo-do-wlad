import * as React from "react";
import { useNavigate, useSearchParams } from "react-router";

import * as Step from "./steps";
import { STEP_TITLES, useWizardForm } from "./useWizardForm";
import type { FormData } from "./schema";

import { Button } from "@jaci/ui/Button";
import * as CardComponent from "@jaci/ui/Card";
import * as DialogComponent from "@jaci/ui/Dialog";
import { Stepper } from "@jaci/ui/Stepper";
import * as Lucide from "lucide-react";

import { ExternalLink } from "@/components/common/ExternalLink";
import { useIsDesktop } from "@/hooks/useIsDesktop";
import { SAMPLE_ADOPTION_FORM_DATA } from "@/mocks/adoption";
import {
  clearIdempotencyKey,
  getAdoptionApplicationId,
  getOrCreateIdempotencyKey,
  type AdoptionSubmissionResult,
} from "./submission";
import { ADOPTION_RECAPTCHA_ACTION, loadRecaptcha } from "./recaptcha";
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

interface WizardFormProps {
  onSubmitSuccess?: (result: AdoptionSubmissionResult) => void;
}

export function WizardForm({ onSubmitSuccess }: WizardFormProps) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const petName = searchParams.get("pet") || "";
  const isDesktop = useIsDesktop();
  const submissionKeyRef = React.useRef<string | null>(null);
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

  const [showResumeDialog, setShowResumeDialog] = React.useState<boolean>(
    () => {
      try {
        const savedData = sessionStorage.getItem(WIZARD_STORAGE_KEYS.formData);
        return (
          !!savedData &&
          savedData !== "{}" &&
          !sessionStorage.getItem(WIZARD_STORAGE_KEYS.dialogShown)
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
    progress,
    formData,
    errors,
    updateField,
    nextStep,
    prevStep,
    goToStep,
    validateCurrentStep,
    highestCompletedStep,
    resetForm,
    fillFormWithSampleData,
  } = useWizardForm();

  React.useEffect(() => {
    const siteKey = import.meta.env.VITE_RECAPTCHA_PUBLIC_KEY as string;
    return loadRecaptcha(siteKey);
  }, []);

  const handleResume = () => {
    setShowResumeDialog(false);
    try {
      sessionStorage.setItem(WIZARD_STORAGE_KEYS.dialogShown, "true");
    } catch {
      /* sem suporte a sessionStorage */
    }
  };

  const handleRestart = () => {
    resetForm();
    submissionKeyRef.current = null;
    setShowResumeDialog(false);
    try {
      sessionStorage.setItem(WIZARD_STORAGE_KEYS.dialogShown, "true");
    } catch {
      /* sem suporte a sessionStorage */
    }
  };

  React.useEffect(() => {
    try {
      sessionStorage.setItem(
        WIZARD_STORAGE_KEYS.showWarning,
        String(showWarning),
      );
    } catch {
      /* sem suporte a sessionStorage */
    }
  }, [showWarning]);

  // pré-preencher nome do pet
  const handleUpdateField = React.useCallback(
    (field: keyof FormData, value: string | number) => {
      updateField(field, value);
    },
    [updateField],
  );

  React.useEffect(() => {
    if (petName && !formData.animal_especifico) {
      updateField("animal_especifico", petName);
    }
  }, [petName, formData.animal_especifico, updateField]);

  const onSubmit = async (e: React.SubmitEvent) => {
    e.preventDefault();

    if (!validateCurrentStep()) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const siteKey = import.meta.env.VITE_RECAPTCHA_PUBLIC_KEY;

      // Captura do token do reCAPTCHA v3
      const token = await new Promise<string>((resolve, reject) => {
        // @ts-expect-error - grecaptcha não está tipado no global
        if (!window.grecaptcha) {
          reject(new Error("reCAPTCHA não carregou corretamente."));
          return;
        }

        // @ts-expect-error - grecaptcha não está tipado no global
        grecaptcha.ready(() => {
          // @ts-expect-error - grecaptcha não está tipado no global
          grecaptcha
            .execute(siteKey, { action: ADOPTION_RECAPTCHA_ACTION })
            .then((token: string) => resolve(token))
            .catch(reject);
        });
      });

      const idempotencyKey =
        submissionKeyRef.current ?? getOrCreateIdempotencyKey(sessionStorage);
      submissionKeyRef.current = idempotencyKey;

      const response = await fetch("/api/adoption/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          ...formData,
          captchaToken: token,
        }),
      });

      const submissionResult = await getAdoptionApplicationId(response);
      clearIdempotencyKey(sessionStorage);
      submissionKeyRef.current = null;

      if (onSubmitSuccess) {
        onSubmitSuccess(submissionResult);
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Erro ao enviar formulário. Tente novamente.";
      setSubmitError(message);
      console.error("Error submitting application:", error);
    } finally {
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
      <div className={styles.wizardContainer}>
        <header className={styles.warningHeader}>
          <span className={styles.warningEyebrow}>Antes de prosseguir</span>
          <h2>Leia com atenção</h2>
          <p>
            Estes quatro pontos ajudam você a entender o compromisso e o
            processo de adoção.
          </p>
        </header>

        <div className={styles.warningProgress}>
          <div className={styles.warningProgressInfo}>
            <span>
              Aviso {warningStep + 1} de {INTRO_WARNINGS.length}
            </span>
            <span>{Math.round(warningProgress)}%</span>
          </div>
          <div
            className={styles.warningProgressTrack}
            role="progressbar"
            aria-label="Progresso dos avisos iniciais"
            aria-valuemin={1}
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
            tone="warning"
            size="lg"
            className={styles.warningCard}
          >
            <CardComponent.CardBody className={styles.warningCardBody}>
              <CardComponent.CardHeader>
                <CardComponent.CardTitle id="warning-title">
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
          <Button
            type="button"
            size={isDesktop ? "lg" : "md"}
            variant="ghost"
            onClick={() => navigate("/caes")}
          >
            Agora não
          </Button>

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
    <div className={styles.wizardContainer}>
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
              clearIdempotencyKey(sessionStorage);
              submissionKeyRef.current = null;
              setSubmitError(null);
              fillFormWithSampleData(SAMPLE_ADOPTION_FORM_DATA);
            }}
          >
            Preencher com dados fictícios
          </Button>
        </div>
      )}

      <Stepper
        steps={STEP_TITLES.map(({ label, icon: Icon }, index) => ({
          label,
          icon: <Icon size={18} />,
          completed: index < currentStep,
          disabled: index > highestCompletedStep,
        }))}
        activeStep={currentStep}
        onStepChange={goToStep}
        progress={{
          label: `Etapa ${currentStep + 1} de ${totalSteps}`,
          value: progress,
        }}
        navigationLabel="Etapas do formulário de adoção"
      >
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
              disabled={isSubmitting}
              rightIcon={<Lucide.Send size={22} />}
            >
              {isSubmitting ? "Enviando..." : "Enviar Respostas"}
            </Button>
          )}
        </div>
        </form>
      </Stepper>

      <DialogComponent.Dialog
        open={showResumeDialog}
        onOpenChange={setShowResumeDialog}
      >
        <DialogComponent.DialogContent size="sm">
          <DialogComponent.DialogHeader>
            <DialogComponent.DialogIcon tone="primary">
              <Lucide.CircleQuestionMark />
            </DialogComponent.DialogIcon>
            <DialogComponent.DialogHeading>
              <DialogComponent.DialogTitle>
                Continuar preenchimento?
              </DialogComponent.DialogTitle>
              <DialogComponent.DialogDescription>
                Encontramos dados salvos de um preenchimento anterior. Deseja
                continuar de onde parou ou começar um novo formulário?
              </DialogComponent.DialogDescription>
            </DialogComponent.DialogHeading>
          </DialogComponent.DialogHeader>
          <DialogComponent.DialogFooter className={styles.dialogFooter}>
            <Button variant="outline" onClick={handleRestart}>
              Começar um novo
            </Button>
            <Button onClick={handleResume}>Continuar preenchimento</Button>
          </DialogComponent.DialogFooter>
        </DialogComponent.DialogContent>
      </DialogComponent.Dialog>
    </div>
  );
}
