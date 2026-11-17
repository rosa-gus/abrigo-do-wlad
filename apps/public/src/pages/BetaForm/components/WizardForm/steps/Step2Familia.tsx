import { FieldWrapper } from "../FieldWrapper";
import type { FormData } from "@abrigo/contracts/adoption-form";
import type { FieldError } from "../useWizardForm";
import styles from "../WizardForm.module.css";
import * as RadioComponent from "@jaci/ui/RadioGroup";
import { Label } from "@jaci/ui/Label";
import { FieldRadioGroup } from "../FieldControls";

interface StepProps {
  formData: Partial<FormData>;
  errors: FieldError;
  updateField: (field: keyof FormData, value: string | number) => void;
}

export function Step2Familia({ formData, errors, updateField }: StepProps) {
  return (
    <div className={styles.stepContent}>
      <FieldWrapper
        name="qtd_adultos"
        label="2.1. Quantos adultos na casa?"
        required
        errors={errors}
      >
        <input
          type="number"
          id="qtd_adultos"
          value={formData.qtd_adultos || ""}
          onChange={(e) => updateField("qtd_adultos", e.target.value)}
        />
      </FieldWrapper>

      <FieldWrapper
        name="criancas"
        label="2.2. Quantas crianças? Quais idades?"
        required
        errors={errors}
      >
        <input
          type="text"
          id="criancas"
          value={formData.criancas || ""}
          onChange={(e) => updateField("criancas", e.target.value)}
          placeholder="Se não tiver, coloque '0'. Se recebe visitas, especifique."
        />
      </FieldWrapper>

      <FieldWrapper
        name="renda_mensal"
        label="2.3. Renda Mensal da família"
        required
        errors={errors}
      >
        <input
          type="text"
          id="renda_mensal"
          value={formData.renda_mensal || ""}
          onChange={(e) => updateField("renda_mensal", e.target.value)}
          placeholder="Ex: R$ 3.000,00"
        />
      </FieldWrapper>

      <FieldWrapper
        name="acordo"
        label="2.4. Todos estão de acordo com a adoção?"
        required
        errors={errors}
      >
        <FieldRadioGroup
          value={formData.acordo || ""}
          onValueChange={(val) => updateField("acordo", val)}
          className={styles.radioGroup}
        >
          <div className={styles.radioOption}>
            <RadioComponent.RadioGroupItem value="Sim" id="acordo_sim" />
            <Label htmlFor="acordo_sim">Sim</Label>
          </div>
          <div className={styles.radioOption}>
            <RadioComponent.RadioGroupItem value="Não" id="acordo_nao" />
            <Label htmlFor="acordo_nao">Não</Label>
          </div>
          <div className={styles.radioOption}>
            <RadioComponent.RadioGroupItem value="Talvez" id="acordo_talvez" />
            <Label htmlFor="acordo_talvez">Talvez</Label>
          </div>
        </FieldRadioGroup>
      </FieldWrapper>

      <FieldWrapper
        name="alergia"
        label="2.5. Há alguém alérgico ou que não gosta de animais? Explique"
        required
        errors={errors}
      >
        <textarea
          id="alergia"
          value={formData.alergia || ""}
          onChange={(e) => updateField("alergia", e.target.value)}
          rows={2}
        />
      </FieldWrapper>
    </div>
  );
}
