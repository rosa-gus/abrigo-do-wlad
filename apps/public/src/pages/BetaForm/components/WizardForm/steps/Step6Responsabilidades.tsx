import { FieldWrapper } from "../FieldWrapper";
import type { FormData } from "@abrigo/contracts/adoption-form";
import type { FieldError } from "../useWizardForm";
import styles from "../WizardForm.module.css";
import * as SelectComponent from "@jaci/ui/Select";
import * as RadioComponent from "@jaci/ui/RadioGroup";
import { Label } from "@jaci/ui/Label";
import { FieldRadioGroup, FieldSelectTrigger } from "../FieldControls";

interface StepProps {
  formData: Partial<FormData>;
  errors: FieldError;
  updateField: (field: keyof FormData, value: string | number) => void;
}

export function Step6Responsabilidades({
  formData,
  errors,
  updateField,
}: StepProps) {
  return (
    <div className={styles.stepContent}>
      <FieldWrapper
        name="coleira"
        label="6.1. Concorda com uso de coleira de identificação (Placa)?"
        required
        errors={errors}
      >
        <FieldRadioGroup
          value={formData.coleira || ""}
          onValueChange={(val) => updateField("coleira", val)}
          className={styles.radioGroup}
        >
          <div className={styles.radioOption}>
            <RadioComponent.RadioGroupItem value="Sim" id="coleira_sim" />
            <Label htmlFor="coleira_sim">Sim</Label>
          </div>
          <div className={styles.radioOption}>
            <RadioComponent.RadioGroupItem value="Não" id="coleira_nao" />
            <Label htmlFor="coleira_nao">Não</Label>
          </div>
          <div className={styles.radioOption}>
            <RadioComponent.RadioGroupItem value="Talvez" id="coleira_talvez" />
            <Label htmlFor="coleira_talvez">Talvez</Label>
          </div>
        </FieldRadioGroup>
      </FieldWrapper>

      <FieldWrapper
        name="ciencia_adaptacao"
        label="6.2. Ciente que o animal passa por adaptação?"
        required
        errors={errors}
      >
        <FieldRadioGroup
          value={formData.ciencia_adaptacao || ""}
          onValueChange={(val) => updateField("ciencia_adaptacao", val)}
          className={styles.radioGroup}
        >
          <div className={styles.radioOption}>
            <RadioComponent.RadioGroupItem value="Sim" id="adaptacao_sim" />
            <Label htmlFor="adaptacao_sim">Sim</Label>
          </div>
          <div className={styles.radioOption}>
            <RadioComponent.RadioGroupItem value="Não" id="adaptacao_nao" />
            <Label htmlFor="adaptacao_nao">Não</Label>
          </div>
          <div className={styles.radioOption}>
            <RadioComponent.RadioGroupItem
              value="Talvez"
              id="adaptacao_talvez"
            />
            <Label htmlFor="adaptacao_talvez">Talvez</Label>
          </div>
        </FieldRadioGroup>
      </FieldWrapper>

      <FieldWrapper
        name="tempo_adaptacao"
        label="6.3. Quanto tempo espera para adaptação?"
        required
        errors={errors}
      >
        <input
          type="text"
          id="tempo_adaptacao"
          value={formData.tempo_adaptacao || ""}
          onChange={(e) => updateField("tempo_adaptacao", e.target.value)}
        />
      </FieldWrapper>

      <FieldWrapper
        name="adestrador"
        label="6.4. Disposto a contratar adestrador se precisar?"
        required
        errors={errors}
      >
        <FieldRadioGroup
          value={formData.adestrador || ""}
          onValueChange={(val) => updateField("adestrador", val)}
          className={styles.radioGroup}
        >
          <div className={styles.radioOption}>
            <RadioComponent.RadioGroupItem value="Sim" id="adestrador_sim" />
            <Label htmlFor="adestrador_sim">Sim</Label>
          </div>
          <div className={styles.radioOption}>
            <RadioComponent.RadioGroupItem value="Não" id="adestrador_nao" />
            <Label htmlFor="adestrador_nao">Não</Label>
          </div>
        </FieldRadioGroup>
      </FieldWrapper>

      <FieldWrapper
        name="motivo_nao_adestrar"
        label="6.5. Se não contratar, qual motivo?"
        errors={errors}
      >
        <SelectComponent.Select
          value={formData.motivo_nao_adestrar || ""}
          onValueChange={(val) => updateField("motivo_nao_adestrar", val)}
        >
          <FieldSelectTrigger>
            <SelectComponent.SelectValue placeholder="Selecione..." />
          </FieldSelectTrigger>
          <SelectComponent.SelectContent>
            <SelectComponent.SelectItem value="Nao se aplica">
              Não se aplica (contratarei)
            </SelectComponent.SelectItem>
            <SelectComponent.SelectItem value="Eu ensinarei">
              Eu mesmo ensinarei
            </SelectComponent.SelectItem>
            <SelectComponent.SelectItem value="Muito caro">
              É muito caro
            </SelectComponent.SelectItem>
            <SelectComponent.SelectItem value="Nao acredito">
              Não acredito em adestramento
            </SelectComponent.SelectItem>
            <SelectComponent.SelectItem value="Outro">
              Outro
            </SelectComponent.SelectItem>
          </SelectComponent.SelectContent>
        </SelectComponent.Select>
      </FieldWrapper>

      <FieldWrapper
        name="carro"
        label="6.6. Possui carro?"
        required
        errors={errors}
      >
        <FieldRadioGroup
          value={formData.carro || ""}
          onValueChange={(val) => updateField("carro", val)}
          className={styles.radioGroup}
        >
          <div className={styles.radioOption}>
            <RadioComponent.RadioGroupItem value="Sim" id="carro_sim" />
            <Label htmlFor="carro_sim">Sim</Label>
          </div>
          <div className={styles.radioOption}>
            <RadioComponent.RadioGroupItem value="Não" id="carro_nao" />
            <Label htmlFor="carro_nao">Não</Label>
          </div>
        </FieldRadioGroup>
      </FieldWrapper>

      <FieldWrapper
        name="financeiro_vet"
        label="6.7. Em emergência, pode levar ao veterinário?"
        required
        errors={errors}
      >
        <SelectComponent.Select
          value={formData.financeiro_vet || ""}
          onValueChange={(val) => updateField("financeiro_vet", val)}
        >
          <FieldSelectTrigger>
            <SelectComponent.SelectValue placeholder="Selecione..." />
          </FieldSelectTrigger>
          <SelectComponent.SelectContent>
            <SelectComponent.SelectItem value="Sim">
              Sim, com certeza
            </SelectComponent.SelectItem>
            <SelectComponent.SelectItem value="Nao">
              Não, no momento não posso ter gastos extras
            </SelectComponent.SelectItem>
            <SelectComponent.SelectItem value="Plano">
              Sim, porque contratarei plano de saúde
            </SelectComponent.SelectItem>
            <SelectComponent.SelectItem value="Publico">
              Sim, levarei em hospital público
            </SelectComponent.SelectItem>
            <SelectComponent.SelectItem value="Outro">
              Outro
            </SelectComponent.SelectItem>
          </SelectComponent.SelectContent>
        </SelectComponent.Select>
      </FieldWrapper>

      <FieldWrapper
        name="vacinas"
        label="6.8. Concorda em vacinar/vermifugar periodicamente?"
        required
        errors={errors}
      >
        <FieldRadioGroup
          value={formData.vacinas || ""}
          onValueChange={(val) => updateField("vacinas", val)}
          className={styles.radioGroup}
        >
          <div className={styles.radioOption}>
            <RadioComponent.RadioGroupItem value="Sim" id="vacinas_sim" />
            <Label htmlFor="vacinas_sim">Sim</Label>
          </div>
          <div className={styles.radioOption}>
            <RadioComponent.RadioGroupItem value="Não" id="vacinas_nao" />
            <Label htmlFor="vacinas_nao">Não</Label>
          </div>
          <div className={styles.radioOption}>
            <RadioComponent.RadioGroupItem value="Talvez" id="vacinas_talvez" />
            <Label htmlFor="vacinas_talvez">Talvez</Label>
          </div>
        </FieldRadioGroup>
      </FieldWrapper>

      <FieldWrapper
        name="gasto_mensal"
        label="6.9. Previsão de gasto mensal"
        required
        errors={errors}
      >
        <SelectComponent.Select
          value={formData.gasto_mensal || ""}
          onValueChange={(val) => updateField("gasto_mensal", val)}
        >
          <FieldSelectTrigger>
            <SelectComponent.SelectValue placeholder="Selecione..." />
          </FieldSelectTrigger>
          <SelectComponent.SelectContent>
            <SelectComponent.SelectItem value="100-150">
              entre 100,00 e 150,00
            </SelectComponent.SelectItem>
            <SelectComponent.SelectItem value="150-250">
              entre 150,00 e 250,00
            </SelectComponent.SelectItem>
            <SelectComponent.SelectItem value="250-300">
              entre 250 e 300,00
            </SelectComponent.SelectItem>
            <SelectComponent.SelectItem value="acima 300">
              acima de 300,00
            </SelectComponent.SelectItem>
            <SelectComponent.SelectItem value="Outro">
              Outro
            </SelectComponent.SelectItem>
          </SelectComponent.SelectContent>
        </SelectComponent.Select>
      </FieldWrapper>
    </div>
  );
}
