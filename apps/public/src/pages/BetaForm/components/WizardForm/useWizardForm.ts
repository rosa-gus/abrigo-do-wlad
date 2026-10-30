import * as React from "react";
import { z } from "zod";
import { adoptionFormSchema, stepSchemas, type FormData } from "./schema";
import { useNavigate, useParams } from "react-router";

import * as Lucide from "lucide-react";
import { ADOPTION_IDEMPOTENCY_STORAGE_KEY } from "./submission";
import { WIZARD_STORAGE_KEYS } from "./wizardStorage";

export interface FieldError {
  [key: string]: string;
}

export const WIZARD_STORAGE_ERROR = "Não foi possível recuperar ou salvar o preenchimento neste navegador. As respostas que aparecem na tela continuam nesta aba, mas podem ser perdidas se você recarregar ou fechar a página.";

function readSavedWizard() {
  try {
    const saved = sessionStorage.getItem(WIZARD_STORAGE_KEYS.formData);
    const data: unknown = saved ? JSON.parse(saved) : {};
    if (typeof data !== "object" || data === null || Array.isArray(data)
      || Object.values(data).some((value) => typeof value !== "string" && typeof value !== "number")) {
      throw new Error("Invalid saved form");
    }
    const savedStep = Number(sessionStorage.getItem(WIZARD_STORAGE_KEYS.highestStep) ?? 0);
    return {
      formData: data as Partial<FormData>,
      highestStep: Number.isInteger(savedStep) && savedStep >= 0 && savedStep < stepSchemas.length ? savedStep : 0,
      storageError: null as string | null,
    };
  } catch {
    return { formData: {} as Partial<FormData>, highestStep: 0, storageError: WIZARD_STORAGE_ERROR };
  }
}

export const STEP_TITLES = [
  { label: "Dados Pessoais", icon: Lucide.User },
  { label: "Família e Renda", icon: Lucide.Users },
  { label: "Sobre a Adoção", icon: Lucide.Dog },
  { label: "Rotina e Moradia", icon: Lucide.Home },
  { label: "Histórico e Veterinário", icon: Lucide.Stethoscope },
  { label: "Responsabilidades", icon: Lucide.ShieldCheck },
  { label: "Termos Finais", icon: Lucide.FileText },
  { label: "O que acontecerá se...", icon: Lucide.HelpCircle },
  { label: "O que faria se o animal...", icon: Lucide.MessageCircleQuestion },
  { label: "Finalização", icon: Lucide.CheckCircle },
];

export function useWizardForm() {
  const { step } = useParams<{ step: string }>();
  const navigate = useNavigate();

  const parsedStep = (() => {
    const parsed = parseInt(step ?? "1", 10);
    return Number.isNaN(parsed) ? 1 : parsed;
  })();

  const currentStep = Math.min(
    Math.max(parsedStep - 1, 0),
    stepSchemas.length - 1,
  );

  const [savedWizard] = React.useState(readSavedWizard);
  const [formData, setFormData] = React.useState(savedWizard.formData);
  const [storageError, setStorageError] = React.useState(savedWizard.storageError);
  const submittedRef = React.useRef(false);
  const [isSubmitted, setIsSubmitted] = React.useState(false);
  const [validationAttempt, setValidationAttempt] = React.useState(0);
  const [errors, setErrors] = React.useState<FieldError>({});
  const [highestCompletedStep, setHighestCompletedStep] = React.useState(savedWizard.highestStep);

  React.useEffect(() => {
    const stepNumber = parsedStep;
    const isValidStep =
      !Number.isNaN(stepNumber) &&
      stepNumber >= 1 &&
      stepNumber <= stepSchemas.length;

    if (!isValidStep || String(stepNumber) !== (step ?? "1")) {
      navigate(`/beta/formulario/step/1`, { replace: true });
    }
  }, [step, navigate, parsedStep]);

  React.useEffect(() => {
    if (submittedRef.current) return;
    try {
      sessionStorage.setItem(
        WIZARD_STORAGE_KEYS.formData,
        JSON.stringify(formData),
      );
    } catch {
      setStorageError(WIZARD_STORAGE_ERROR);
    }
  }, [formData]);

  React.useEffect(() => {
    if (submittedRef.current) return;
    try {
      sessionStorage.setItem(
        WIZARD_STORAGE_KEYS.highestStep,
        String(highestCompletedStep),
      );
    } catch {
      setStorageError(WIZARD_STORAGE_ERROR);
    }
  }, [highestCompletedStep]);

  const totalSteps = stepSchemas.length;
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === totalSteps - 1;
  const progress = ((currentStep + 1) / totalSteps) * 100;

  React.useEffect(() => {
    if (submittedRef.current) return;
    if (currentStep > highestCompletedStep) {
      navigate(`/beta/formulario/step/${highestCompletedStep + 1}`, {
        replace: true,
      });
    }
  }, [currentStep, highestCompletedStep, navigate]);

  const validateCurrentStep = React.useCallback((): boolean => {
    const schema: z.ZodType = stepSchemas[currentStep];
    const result = schema.safeParse(formData);

    if (!result.success) {
      const fieldErrors: FieldError = {};
      result.error.issues.forEach((err) => {
        const field = err.path[0] as string;
        fieldErrors[field] = err.message;
      });
      setErrors(fieldErrors);
      setValidationAttempt((attempt) => attempt + 1);
      return false;
    }

    setErrors({});
    return true;
  }, [currentStep, formData]);

  const validateAllSteps = React.useCallback(() => {
    const result = adoptionFormSchema.safeParse(formData);
    if (result.success) {
      setErrors({});
      return result.data;
    }
    const firstField = String(result.error.issues[0]?.path[0]);
    const firstStep = Math.max(0, stepSchemas.findIndex((schema) => firstField in schema.shape));
    const fields = stepSchemas[firstStep].shape;
    const fieldErrors: FieldError = {};
    for (const issue of result.error.issues) {
      const field = String(issue.path[0]);
      if (field in fields) fieldErrors[field] = issue.message;
    }
    setErrors(fieldErrors);
    setValidationAttempt((attempt) => attempt + 1);
    navigate(`/beta/formulario/step/${firstStep + 1}`);
    return null;
  }, [formData, navigate]);

  const updateField = React.useCallback(
    (field: keyof FormData, value: string | number) => {
      setFormData((prev) => ({ ...prev, [field]: value }));
      // Limpar erro do campo quando o usuário altera
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field as string];
        return next;
      });
    },
    [],
  );

  const nextStep = React.useCallback(() => {
    if (validateCurrentStep() && currentStep < totalSteps - 1) {
      setHighestCompletedStep((prev) => Math.max(prev, currentStep + 1)); // liberar próxima step
      navigate(`/beta/formulario/step/${currentStep + 2}`);
    }
  }, [validateCurrentStep, currentStep, totalSteps, navigate]);

  const prevStep = React.useCallback(() => {
    if (currentStep > 0) {
      setErrors({});
      navigate(`/beta/formulario/step/${currentStep}`);
    }
  }, [currentStep, navigate]);

  const goToStep = React.useCallback(
    (step: number) => {
      if (step >= 0 && step < totalSteps && step <= highestCompletedStep) {
        setErrors({});
        navigate(`/beta/formulario/step/${step + 1}`);
      }
    },
    [highestCompletedStep, totalSteps, navigate],
  );

  const resetForm = React.useCallback(() => {
    submittedRef.current = false;
    setIsSubmitted(false);
    [
      WIZARD_STORAGE_KEYS.formData,
      WIZARD_STORAGE_KEYS.highestStep,
      ADOPTION_IDEMPOTENCY_STORAGE_KEY,
    ].forEach((key) => {
      try {
        sessionStorage.removeItem(key);
      } catch {
        setStorageError(WIZARD_STORAGE_ERROR);
      }
    });
    setFormData({});
    setErrors({});
    setHighestCompletedStep(0);
    navigate(`/beta/formulario/step/1`, { replace: true });
  }, [navigate]);

  const completeForm = React.useCallback((): boolean => {
    // Mark completion before changing state so persistence effects cannot recreate the draft.
    submittedRef.current = true;
    setIsSubmitted(true);
    setFormData({});
    setErrors({});
    setHighestCompletedStep(0);
    setValidationAttempt(0);
    let cleared = true;
    for (const key of Object.values(WIZARD_STORAGE_KEYS)) {
      try {
        sessionStorage.removeItem(key);
      } catch {
        cleared = false;
      }
    }
    // If draft removal fails, retain its idempotency key to protect a later retry.
    if (cleared) {
      try {
        sessionStorage.removeItem(ADOPTION_IDEMPOTENCY_STORAGE_KEY);
      } catch {
        cleared = false;
      }
    }
    return cleared;
  }, []);

  const fillFormWithSampleData = React.useCallback(
    (sampleData: Omit<FormData, "captchaToken">) => {
      setFormData(sampleData);
      setErrors({});
      setHighestCompletedStep(0);
      navigate("/beta/formulario/step/1", { replace: true });
    },
    [navigate],
  );

  return {
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
    validateCurrentStep,
    validateAllSteps,
    setErrors,
    highestCompletedStep,
    resetForm,
    completeForm,
    fillFormWithSampleData,
  };
}
