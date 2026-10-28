import * as React from "react";
import { z } from "zod";
import { stepSchemas, type FormData } from "./schema";
import { useNavigate, useParams } from "react-router";

import * as Lucide from "lucide-react";
import { ADOPTION_IDEMPOTENCY_STORAGE_KEY } from "./submission";
import { WIZARD_STORAGE_KEYS } from "./wizardStorage";

export interface FieldError {
  [key: string]: string;
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

  const [formData, setFormData] = React.useState<Partial<FormData>>(() => {
    try {
      const saved = sessionStorage.getItem(WIZARD_STORAGE_KEYS.formData);
      return saved ? (JSON.parse(saved) as Partial<FormData>) : {};
    } catch {
      return {};
    }
  });
  const [errors, setErrors] = React.useState<FieldError>({});
  const [highestCompletedStep, setHighestCompletedStep] =
    React.useState<number>(() => {
      try {
        const saved = sessionStorage.getItem(WIZARD_STORAGE_KEYS.highestStep);
        const parsed = saved ? parseInt(saved, 10) : 0;
        return Number.isInteger(parsed) &&
          parsed >= 0 &&
          parsed < stepSchemas.length
          ? parsed
          : 0;
      } catch {
        return 0;
      }
    });

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
    try {
      sessionStorage.setItem(
        WIZARD_STORAGE_KEYS.formData,
        JSON.stringify(formData),
      );
    } catch {
      /* sem suporte a sessionStorage */
    }
  }, [formData]);

  React.useEffect(() => {
    try {
      sessionStorage.setItem(
        WIZARD_STORAGE_KEYS.highestStep,
        String(highestCompletedStep),
      );
    } catch {
      /* sem suporte a sessionStorage */
    }
  }, [highestCompletedStep]);

  const totalSteps = stepSchemas.length;
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === totalSteps - 1;
  const progress = ((currentStep + 1) / totalSteps) * 100;

  React.useEffect(() => {
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
      return false;
    }

    setErrors({});
    return true;
  }, [currentStep, formData]);

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
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [validateCurrentStep, currentStep, totalSteps, navigate]);

  const prevStep = React.useCallback(() => {
    if (currentStep > 0) {
      setErrors({});
      navigate(`/beta/formulario/step/${currentStep}`);
      window.scrollTo({ top: 0, behavior: "smooth" });
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
    [
      WIZARD_STORAGE_KEYS.formData,
      WIZARD_STORAGE_KEYS.highestStep,
      ADOPTION_IDEMPOTENCY_STORAGE_KEY,
    ].forEach((key) => {
      try {
        sessionStorage.removeItem(key);
      } catch {
        /* sem suporte a sessionStorage */
      }
    });
    setFormData({});
    setErrors({});
    setHighestCompletedStep(0);
    navigate(`/beta/formulario/step/1`, { replace: true });
  }, [navigate]);

  const fillFormWithSampleData = React.useCallback(
    (sampleData: Omit<FormData, "captchaToken">) => {
      setFormData(sampleData);
      setErrors({});
      setHighestCompletedStep(0);
      navigate("/beta/formulario/step/1", { replace: true });
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [navigate],
  );

  return {
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
    setErrors,
    highestCompletedStep,
    resetForm,
    fillFormWithSampleData,
  };
}
