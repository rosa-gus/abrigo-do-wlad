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

export function Step7Termos({ formData, errors, updateField }: StepProps) {
  return (
    <div className={styles.stepContent}>
      <FieldWrapper
        name="divulgacao"
        label="7.1. Onde viu a divulgação? (Qual perfil?)"
        required
        errors={errors}
      >
        <input
          type="text"
          id="divulgacao"
          value={formData.divulgacao || ""}
          onChange={(e) => updateField("divulgacao", e.target.value)}
        />
      </FieldWrapper>

      <FieldWrapper
        name="noticias"
        label="7.2. Aceita mandar notícias (fotos/vídeos)?"
        required
        errors={errors}
      >
        <FieldRadioGroup
          value={formData.noticias || ""}
          onValueChange={(val) => updateField("noticias", val)}
          className={styles.radioGroup}
        >
          <div className={styles.radioOption}>
            <RadioComponent.RadioGroupItem value="Sim" id="noticias_sim" />
            <Label htmlFor="noticias_sim">Sim</Label>
          </div>
          <div className={styles.radioOption}>
            <RadioComponent.RadioGroupItem value="Não" id="noticias_nao" />
            <Label htmlFor="noticias_nao">Não</Label>
          </div>
          <div className={styles.radioOption}>
            <RadioComponent.RadioGroupItem
              value="Talvez"
              id="noticias_talvez"
            />
            <Label htmlFor="noticias_talvez">Talvez</Label>
          </div>
        </FieldRadioGroup>
      </FieldWrapper>

      <FieldWrapper
        name="visitas"
        label="7.3. Aceita visitas do protetor?"
        required
        errors={errors}
      >
        <FieldRadioGroup
          value={formData.visitas || ""}
          onValueChange={(val) => updateField("visitas", val)}
          className={styles.radioGroup}
        >
          <div className={styles.radioOption}>
            <RadioComponent.RadioGroupItem value="Sim" id="visitas_sim" />
            <Label htmlFor="visitas_sim">Sim</Label>
          </div>
          <div className={styles.radioOption}>
            <RadioComponent.RadioGroupItem value="Não" id="visitas_nao" />
            <Label htmlFor="visitas_nao">Não</Label>
          </div>
        </FieldRadioGroup>
      </FieldWrapper>

      <FieldWrapper
        name="fotos_adocao"
        label="7.4. Permite divulgarmos fotos da adoção?"
        required
        errors={errors}
      >
        <FieldRadioGroup
          value={formData.fotos_adocao || ""}
          onValueChange={(val) => updateField("fotos_adocao", val)}
          className={styles.radioGroup}
        >
          <div className={styles.radioOption}>
            <RadioComponent.RadioGroupItem value="Sim" id="fotos_adocao_sim" />
            <Label htmlFor="fotos_adocao_sim">Sim</Label>
          </div>
          <div className={styles.radioOption}>
            <RadioComponent.RadioGroupItem value="Não" id="fotos_adocao_nao" />
            <Label htmlFor="fotos_adocao_nao">Não</Label>
          </div>
        </FieldRadioGroup>
      </FieldWrapper>

      <FieldWrapper
        name="contribuicao"
        label="7.5. Concorda com a taxa de adoção informada pelo protetor?"
        required
        errors={errors}
      >
        <FieldRadioGroup
          value={formData.contribuicao || ""}
          onValueChange={(val) => updateField("contribuicao", val)}
          className={styles.radioGroup}
        >
          <div className={styles.radioOption}>
            <RadioComponent.RadioGroupItem value="Sim" id="contribuicao_sim" />
            <Label htmlFor="contribuicao_sim">Sim</Label>
          </div>
          <div className={styles.radioOption}>
            <RadioComponent.RadioGroupItem value="Não" id="contribuicao_nao" />
            <Label htmlFor="contribuicao_nao">Não</Label>
          </div>
        </FieldRadioGroup>
      </FieldWrapper>

      <FieldWrapper
        name="compromisso_vida"
        label="7.6. Ciente que vivem 15+ anos? Preparado?"
        required
        errors={errors}
      >
        <FieldRadioGroup
          value={formData.compromisso_vida || ""}
          onValueChange={(val) => updateField("compromisso_vida", val)}
          className={styles.radioGroup}
        >
          <div className={styles.radioOption}>
            <RadioComponent.RadioGroupItem value="Sim" id="compromisso_sim" />
            <Label htmlFor="compromisso_sim">Sim</Label>
          </div>
          <div className={styles.radioOption}>
            <RadioComponent.RadioGroupItem value="Não" id="compromisso_nao" />
            <Label htmlFor="compromisso_nao">Não</Label>
          </div>
          <div className={styles.radioOption}>
            <RadioComponent.RadioGroupItem
              value="Talvez"
              id="compromisso_talvez"
            />
            <Label htmlFor="compromisso_talvez">Talvez</Label>
          </div>
        </FieldRadioGroup>
      </FieldWrapper>
    </div>
  );
}
