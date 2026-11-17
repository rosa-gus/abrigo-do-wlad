import { FieldWrapper } from "../FieldWrapper";
import type { FormData } from "@abrigo/contracts/adoption-form";
import type { FieldError } from "../useWizardForm";
import styles from "../WizardForm.module.css";

interface StepProps {
  formData: Partial<FormData>;
  errors: FieldError;
  updateField: (field: keyof FormData, value: string | number) => void;
}

export function Step9Situacoes({ formData, errors, updateField }: StepProps) {
  return (
    <div className={styles.stepContent}>
      <FieldWrapper
        name="perder"
        label="9.1. Se perdesse?"
        required
        errors={errors}
      >
        <input
          type="text"
          id="perder"
          value={formData.perder || ""}
          onChange={(e) => updateField("perder", e.target.value)}
        />
      </FieldWrapper>

      <FieldWrapper
        name="doenca"
        label="9.2. Adoecesse/Acidente?"
        required
        errors={errors}
      >
        <input
          type="text"
          id="doenca"
          value={formData.doenca || ""}
          onChange={(e) => updateField("doenca", e.target.value)}
        />
      </FieldWrapper>

      <FieldWrapper
        name="morder"
        label="9.3. Mordesse alguém?"
        required
        errors={errors}
      >
        <input
          type="text"
          id="morder"
          value={formData.morder || ""}
          onChange={(e) => updateField("morder", e.target.value)}
        />
      </FieldWrapper>

      <FieldWrapper
        name="destruicao"
        label="9.4. Destruísse objetos de valor?"
        required
        errors={errors}
      >
        <input
          type="text"
          id="destruicao"
          value={formData.destruicao || ""}
          onChange={(e) => updateField("destruicao", e.target.value)}
        />
      </FieldWrapper>

      <FieldWrapper
        name="xixi_errado"
        label="9.5. Fizesse necessidades no lugar errado?"
        required
        errors={errors}
      >
        <input
          type="text"
          id="xixi_errado"
          value={formData.xixi_errado || ""}
          onChange={(e) => updateField("xixi_errado", e.target.value)}
        />
      </FieldWrapper>
    </div>
  );
}
