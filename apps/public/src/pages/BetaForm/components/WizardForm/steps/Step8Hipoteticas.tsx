import { FieldWrapper } from "../FieldWrapper";
import type { FormData } from "@abrigo/contracts/adoption-form";
import type { FieldError } from "../useWizardForm";
import styles from "../WizardForm.module.css";

interface StepProps {
  formData: Partial<FormData>;
  errors: FieldError;
  updateField: (field: keyof FormData, value: string | number) => void;
}

export function Step8Hipoteticas({ formData, errors, updateField }: StepProps) {
  return (
    <div className={styles.stepContent}>
      <p className={styles.helperText}>
        Responda com detalhes. Questões para reflexão.
      </p>

      <FieldWrapper
        name="gravidez"
        label="8.1. Alguém engravidar?"
        required
        errors={errors}
      >
        <textarea
          id="gravidez"
          value={formData.gravidez || ""}
          onChange={(e) => updateField("gravidez", e.target.value)}
          rows={2}
        />
      </FieldWrapper>

      <FieldWrapper
        name="viagem"
        label="8.2. A família viajar?"
        required
        errors={errors}
      >
        <textarea
          id="viagem"
          value={formData.viagem || ""}
          onChange={(e) => updateField("viagem", e.target.value)}
          rows={2}
        />
      </FieldWrapper>

      <FieldWrapper
        name="mudanca_menor"
        label="8.3. Mudança para casa menor?"
        required
        errors={errors}
      >
        <textarea
          id="mudanca_menor"
          value={formData.mudanca_menor || ""}
          onChange={(e) => updateField("mudanca_menor", e.target.value)}
          rows={2}
        />
      </FieldWrapper>

      <FieldWrapper
        name="mudanca_longe"
        label="8.4. Mudança de cidade/país?"
        required
        errors={errors}
      >
        <textarea
          id="mudanca_longe"
          value={formData.mudanca_longe || ""}
          onChange={(e) => updateField("mudanca_longe", e.target.value)}
          rows={2}
        />
      </FieldWrapper>

      <FieldWrapper
        name="separacao"
        label="8.5. Separação do casal?"
        required
        errors={errors}
      >
        <textarea
          id="separacao"
          value={formData.separacao || ""}
          onChange={(e) => updateField("separacao", e.target.value)}
          rows={2}
        />
      </FieldWrapper>

      <FieldWrapper
        name="falecimento"
        label="8.6. Falecimento do responsável?"
        required
        errors={errors}
      >
        <textarea
          id="falecimento"
          value={formData.falecimento || ""}
          onChange={(e) => updateField("falecimento", e.target.value)}
          rows={2}
        />
      </FieldWrapper>
    </div>
  );
}
