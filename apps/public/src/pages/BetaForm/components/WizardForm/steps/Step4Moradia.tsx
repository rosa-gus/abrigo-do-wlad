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

export function Step4Moradia({ formData, errors, updateField }: StepProps) {
  return (
    <div className={styles.stepContent}>
      <FieldWrapper
        name="responsavel"
        label="4.1. Quem será o principal responsável do animal?"
        required
        errors={errors}
      >
        <input
          type="text"
          id="responsavel"
          value={formData.responsavel || ""}
          onChange={(e) => updateField("responsavel", e.target.value)}
        />
      </FieldWrapper>

      <FieldWrapper
        name="horas_sozinho"
        label="4.2. Quantas horas por dia o animal ficará sozinho?"
        required
        errors={errors}
      >
        <input
          type="text"
          id="horas_sozinho"
          value={formData.horas_sozinho || ""}
          onChange={(e) => updateField("horas_sozinho", e.target.value)}
        />
      </FieldWrapper>

      <FieldWrapper
        name="passeios"
        label="4.3. Pretende passear? Quantas vezes/horários?"
        required
        errors={errors}
      >
        <input
          type="text"
          id="passeios"
          value={formData.passeios || ""}
          onChange={(e) => updateField("passeios", e.target.value)}
        />
      </FieldWrapper>

      <FieldWrapper
        name="tipo_moradia"
        label="4.4. Sobre sua moradia"
        required
        errors={errors}
      >
        <FieldRadioGroup
          value={formData.tipo_moradia || ""}
          onValueChange={(val) => updateField("tipo_moradia", val)}
          className={styles.radioGroup}
        >
          <div className={styles.radioOption}>
            <RadioComponent.RadioGroupItem
              value="Propria"
              id="moradia_propria"
            />
            <Label htmlFor="moradia_propria">Própria</Label>
          </div>
          <div className={styles.radioOption}>
            <RadioComponent.RadioGroupItem
              value="Alugada"
              id="moradia_alugada"
            />
            <Label htmlFor="moradia_alugada">Alugada</Label>
          </div>
        </FieldRadioGroup>
      </FieldWrapper>

      <FieldWrapper
        name="proprietario_permite"
        label="4.5. Se alugada, proprietário permite animais?"
        errors={errors}
      >
        <FieldRadioGroup
          value={formData.proprietario_permite || "Nao aplica"}
          onValueChange={(val) => updateField("proprietario_permite", val)}
          className={styles.radioGroup}
        >
          <div className={styles.radioOption}>
            <RadioComponent.RadioGroupItem value="Sim" id="proprietario_sim" />
            <Label htmlFor="proprietario_sim">Sim</Label>
          </div>
          <div className={styles.radioOption}>
            <RadioComponent.RadioGroupItem value="Não" id="proprietario_nao" />
            <Label htmlFor="proprietario_nao">Não</Label>
          </div>
          <div className={styles.radioOption}>
            <RadioComponent.RadioGroupItem
              value="Nao sei"
              id="proprietario_nao_sei"
            />
            <Label htmlFor="proprietario_nao_sei">Não sei</Label>
          </div>
          <div className={styles.radioOption}>
            <RadioComponent.RadioGroupItem
              value="Nao aplica"
              id="proprietario_nao_aplica"
            />
            <Label htmlFor="proprietario_nao_aplica">
              Minha casa é própria
            </Label>
          </div>
        </FieldRadioGroup>
      </FieldWrapper>

      <FieldWrapper
        name="detalhes_moradia"
        label="4.6. Detalhes da moradia"
        required
        errors={errors}
      >
        <SelectComponent.Select
          value={formData.detalhes_moradia || ""}
          onValueChange={(val) => updateField("detalhes_moradia", val)}
        >
          <FieldSelectTrigger>
            <SelectComponent.SelectValue placeholder="Selecione" />
          </FieldSelectTrigger>
          <SelectComponent.SelectContent>
            <SelectComponent.SelectItem value="Casa quintal">
              Casa com quintal
            </SelectComponent.SelectItem>
            <SelectComponent.SelectItem value="Casa quintal compartilhado">
              Casa com quintal Compartilhado
            </SelectComponent.SelectItem>
            <SelectComponent.SelectItem value="Casa sem quintal">
              Casa sem quintal
            </SelectComponent.SelectItem>
            <SelectComponent.SelectItem value="Muros altos">
              Casa com muros altos
            </SelectComponent.SelectItem>
            <SelectComponent.SelectItem value="Com Telas">
              Casa com Telas nas janelas
            </SelectComponent.SelectItem>
            <SelectComponent.SelectItem value="Portao Fechado">
              Telas no portão ou portão fechado
            </SelectComponent.SelectItem>
            <SelectComponent.SelectItem value="Tudo fechado">
              Não tenho muros/telas mas deixarei fechado
            </SelectComponent.SelectItem>
            <SelectComponent.SelectItem value="Ap telas total">
              Apartamento com telas em todas as janelas
            </SelectComponent.SelectItem>
            <SelectComponent.SelectItem value="Ap telas parcial">
              Apartamento com telas exceto basculantes
            </SelectComponent.SelectItem>
            <SelectComponent.SelectItem value="Ap sem telas">
              Apartamento sem telas e não colocarei
            </SelectComponent.SelectItem>
            <SelectComponent.SelectItem value="Ap colocarei">
              Apartamento sem telas mas colocarei
            </SelectComponent.SelectItem>
            <SelectComponent.SelectItem value="Ap varanda fechada">
              Apartamento com varanda fechada
            </SelectComponent.SelectItem>
            <SelectComponent.SelectItem value="Ap varanda aberta">
              Apartamento com varanda aberta
            </SelectComponent.SelectItem>
          </SelectComponent.SelectContent>
        </SelectComponent.Select>
      </FieldWrapper>

      <FieldWrapper
        name="moradores"
        label="4.7. Quem mora na casa/ap?"
        required
        errors={errors}
      >
        <input
          type="text"
          id="moradores"
          value={formData.moradores || ""}
          onChange={(e) => updateField("moradores", e.target.value)}
          placeholder="Cônjuges, Filhos, Avós..."
        />
      </FieldWrapper>

      <FieldWrapper
        name="areas_frequentar"
        label="4.8. Em quais áreas o animal poderá frequentar?"
        required
        errors={errors}
      >
        <input
          type="text"
          id="areas_frequentar"
          value={formData.areas_frequentar || ""}
          onChange={(e) => updateField("areas_frequentar", e.target.value)}
        />
      </FieldWrapper>

      <FieldWrapper
        name="periodos"
        label="4.9. Em quais períodos poderá frequentar as áreas acima?"
        required
        errors={errors}
      >
        <input
          type="text"
          id="periodos"
          value={formData.periodos || ""}
          onChange={(e) => updateField("periodos", e.target.value)}
        />
      </FieldWrapper>

      <FieldWrapper
        name="dormir"
        label="4.10. Onde o animal irá dormir?"
        required
        errors={errors}
      >
        <input
          type="text"
          id="dormir"
          value={formData.dormir || ""}
          onChange={(e) => updateField("dormir", e.target.value)}
        />
      </FieldWrapper>

      <FieldWrapper
        name="acesso"
        label="4.11. Acesso a cômodos"
        required
        errors={errors}
      >
        <SelectComponent.Select
          value={formData.acesso || ""}
          onValueChange={(val) => updateField("acesso", val)}
        >
          <FieldSelectTrigger>
            <SelectComponent.SelectValue placeholder="Selecione" />
          </FieldSelectTrigger>
          <SelectComponent.SelectContent>
            <SelectComponent.SelectItem value="Total">
              Acesso total
            </SelectComponent.SelectItem>
            <SelectComponent.SelectItem value="Parcial">
              Acesso total exceto alguns cômodos
            </SelectComponent.SelectItem>
            <SelectComponent.SelectItem value="Restrito">
              Somente varanda/quintal
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
