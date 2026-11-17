import { FieldWrapper } from "../FieldWrapper";
import type { FormData } from "@abrigo/contracts/adoption-form";
import type { FieldError } from "../useWizardForm";
import styles from "../WizardForm.module.css";

interface StepProps {
  formData: Partial<FormData>;
  errors: FieldError;
  updateField: (field: keyof FormData, value: string | number) => void;
}

export function Step5Historico({ formData, errors, updateField }: StepProps) {
  return (
    <div className={styles.stepContent}>
      <FieldWrapper
        name="outros_animais"
        label="5.1. Tem outros animais? Quantos/Quais?"
        required
        errors={errors}
      >
        <input
          type="text"
          id="outros_animais"
          value={formData.outros_animais || ""}
          onChange={(e) => updateField("outros_animais", e.target.value)}
        />
      </FieldWrapper>

      <FieldWrapper
        name="castrados"
        label="5.2. Se tem, estão castrados?"
        required
        errors={errors}
      >
        <input
          type="text"
          id="castrados"
          value={formData.castrados || ""}
          onChange={(e) => updateField("castrados", e.target.value)}
        />
      </FieldWrapper>

      <FieldWrapper
        name="ja_teve"
        label="5.3. Já teve outros animais? Quantos/Quais?"
        required
        errors={errors}
      >
        <input
          type="text"
          id="ja_teve"
          value={formData.ja_teve || ""}
          onChange={(e) => updateField("ja_teve", e.target.value)}
        />
      </FieldWrapper>

      <FieldWrapper
        name="destino_antigos"
        label="5.4. O que aconteceu com os antigos? (Se morreram, causa da morte)"
        required
        errors={errors}
      >
        <textarea
          id="destino_antigos"
          value={formData.destino_antigos || ""}
          onChange={(e) => updateField("destino_antigos", e.target.value)}
          rows={2}
          placeholder="Responda mesmo que tenha convivido na casa dos pais"
        />
      </FieldWrapper>

      <FieldWrapper
        name="veterinario"
        label="5.5. Qual veterinário/clínica pretende usar?"
        required
        errors={errors}
      >
        <input
          type="text"
          id="veterinario"
          value={formData.veterinario || ""}
          onChange={(e) => updateField("veterinario", e.target.value)}
        />
      </FieldWrapper>

      <FieldWrapper
        name="racao"
        label="5.6. Qual marca de ração pretende usar?"
        required
        errors={errors}
      >
        <input
          type="text"
          id="racao"
          value={formData.racao || ""}
          onChange={(e) => updateField("racao", e.target.value)}
        />
      </FieldWrapper>
    </div>
  );
}
