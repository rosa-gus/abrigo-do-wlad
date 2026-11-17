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

export function Step3Adocao({ formData, errors, updateField }: StepProps) {
  return (
    <div className={styles.stepContent}>
      <FieldWrapper
        name="motivo"
        label="3.1. Por qual motivo decidiram ter um animalzinho?"
        required
        errors={errors}
      >
        <textarea
          id="motivo"
          value={formData.motivo || ""}
          onChange={(e) => updateField("motivo", e.target.value)}
          rows={2}
        />
      </FieldWrapper>

      <FieldWrapper
        name="animal_especifico"
        label="3.2. Animal específico? Se sim, qual nome?"
        errors={errors}
      >
        <input
          type="text"
          id="animal_especifico"
          value={formData.animal_especifico || ""}
          onChange={(e) => updateField("animal_especifico", e.target.value)}
        />
      </FieldWrapper>

      <div className={styles.subSection}>
        <h4>3.3. Preferências (Caso não tenha um específico)</h4>

        <FieldWrapper
          name="porte"
          label="3.3.1. Porte"
          required
          errors={errors}
        >
          <SelectComponent.Select
            value={formData.porte || ""}
            onValueChange={(val) => updateField("porte", val)}
          >
            <FieldSelectTrigger>
              <SelectComponent.SelectValue placeholder="Selecione" />
            </FieldSelectTrigger>
            <SelectComponent.SelectContent>
              <SelectComponent.SelectItem value="Nao Importa">
                Não importa
              </SelectComponent.SelectItem>
              <SelectComponent.SelectItem value="Mini">
                Mini (até 4kgs)
              </SelectComponent.SelectItem>
              <SelectComponent.SelectItem value="Pequeno">
                Pequeno (5 a 10kgs)
              </SelectComponent.SelectItem>
              <SelectComponent.SelectItem value="Pequeno Médio">
                Pequeno para médio (11 a 14kgs)
              </SelectComponent.SelectItem>
              <SelectComponent.SelectItem value="Medio">
                Médio (15 a 20kgs)
              </SelectComponent.SelectItem>
              <SelectComponent.SelectItem value="Grande">
                Grande (mais de 21 kgs)
              </SelectComponent.SelectItem>
            </SelectComponent.SelectContent>
          </SelectComponent.Select>
        </FieldWrapper>

        <FieldWrapper name="sexo" label="3.3.2. Sexo" errors={errors}>
          <FieldRadioGroup
            value={formData.sexo || "Não importa"}
            onValueChange={(val) => updateField("sexo", val)}
            className={styles.radioGroup}
          >
            <div className={styles.radioOption}>
              <RadioComponent.RadioGroupItem value="Fêmea" id="sexo_femea" />
              <Label htmlFor="sexo_femea">Só fêmea</Label>
            </div>
            <div className={styles.radioOption}>
              <RadioComponent.RadioGroupItem value="Macho" id="sexo_macho" />
              <Label htmlFor="sexo_macho">Só macho</Label>
            </div>
            <div className={styles.radioOption}>
              <RadioComponent.RadioGroupItem
                value="Não importa"
                id="sexo_nao_importa"
              />
              <Label htmlFor="sexo_nao_importa">Não importa</Label>
            </div>
          </FieldRadioGroup>
        </FieldWrapper>

        <FieldWrapper
          name="idade_animal"
          label="3.3.3. Idade"
          required
          errors={errors}
        >
          <SelectComponent.Select
            value={formData.idade_animal || ""}
            onValueChange={(val) => updateField("idade_animal", val)}
          >
            <FieldSelectTrigger>
              <SelectComponent.SelectValue placeholder="Selecione" />
            </FieldSelectTrigger>
            <SelectComponent.SelectContent>
              <SelectComponent.SelectItem value="Nao importa">
                Não importa
              </SelectComponent.SelectItem>
              <SelectComponent.SelectItem value="Filhote">
                Filhote (4-11 meses)
              </SelectComponent.SelectItem>
              <SelectComponent.SelectItem value="Adulto Jovem">
                Adulto (1 a 5 anos)
              </SelectComponent.SelectItem>
              <SelectComponent.SelectItem value="Adulto Maduro">
                Adulto (6 a 9 anos)
              </SelectComponent.SelectItem>
              <SelectComponent.SelectItem value="Idoso">
                Idoso
              </SelectComponent.SelectItem>
            </SelectComponent.SelectContent>
          </SelectComponent.Select>
        </FieldWrapper>

        <FieldWrapper
          name="personalidade"
          label="3.3.4. Personalidade"
          required
          errors={errors}
        >
          <SelectComponent.Select
            value={formData.personalidade || ""}
            onValueChange={(val) => updateField("personalidade", val)}
          >
            <FieldSelectTrigger>
              <SelectComponent.SelectValue placeholder="Selecione" />
            </FieldSelectTrigger>
            <SelectComponent.SelectContent>
              <SelectComponent.SelectItem value="Brincalhao">
                Brincalhão
              </SelectComponent.SelectItem>
              <SelectComponent.SelectItem value="Super Ativo">
                Super Ativo
              </SelectComponent.SelectItem>
              <SelectComponent.SelectItem value="Independente">
                Independente
              </SelectComponent.SelectItem>
              <SelectComponent.SelectItem value="Carente">
                Carente
              </SelectComponent.SelectItem>
              <SelectComponent.SelectItem value="Grudinho">
                Grudinho
              </SelectComponent.SelectItem>
              <SelectComponent.SelectItem value="Para Correr">
                Que possa correr comigo
              </SelectComponent.SelectItem>
            </SelectComponent.SelectContent>
          </SelectComponent.Select>
        </FieldWrapper>
      </div>

      <FieldWrapper
        name="atividade"
        label="3.3.5. Atividade principal do animal?"
        required
        errors={errors}
      >
        <FieldRadioGroup
          value={formData.atividade || ""}
          onValueChange={(val) => updateField("atividade", val)}
          className={styles.radioGroup}
        >
          <div className={styles.radioOption}>
            <RadioComponent.RadioGroupItem
              value="Companhia"
              id="atividade_companhia"
            />
            <Label htmlFor="atividade_companhia">Companhia</Label>
          </div>
          <div className={styles.radioOption}>
            <RadioComponent.RadioGroupItem
              value="Guarda"
              id="atividade_guarda"
            />
            <Label htmlFor="atividade_guarda">Guarda</Label>
          </div>
        </FieldRadioGroup>
      </FieldWrapper>
    </div>
  );
}
