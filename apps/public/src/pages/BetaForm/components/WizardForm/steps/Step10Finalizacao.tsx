import { FieldWrapper } from "../FieldWrapper";
import type { FormData } from "@abrigo/contracts/adoption-form";
import type { FieldError } from "../useWizardForm";
import styles from "../WizardForm.module.css";
import * as RadioComponent from "@jaci/ui/RadioGroup";
import { Label } from "@jaci/ui/Label";
import {
  Card,
  CardBody,
  CardContent,
  CardIcon,
  CardTitle,
} from "@jaci/ui/Card";
import { CircleAlert } from "lucide-react";
import { FieldRadioGroup } from "../FieldControls";

interface StepProps {
  formData: Partial<FormData>;
  errors: FieldError;
  updateField: (field: keyof FormData, value: string | number) => void;
}

export function Step10Finalizacao({
  formData,
  errors,
  updateField,
}: StepProps) {
  return (
    <div className={styles.stepContent}>
      <FieldWrapper
        name="enxoval"
        label="10.1. O que vai comprar para recebê-lo?"
        required
        errors={errors}
      >
        <textarea
          id="enxoval"
          value={formData.enxoval || ""}
          onChange={(e) => updateField("enxoval", e.target.value)}
          rows={2}
        />
      </FieldWrapper>

      <FieldWrapper
        name="devolucao"
        label="10.2. Em que condição devolveria o animal?"
        required
        errors={errors}
      >
        <textarea
          id="devolucao"
          value={formData.devolucao || ""}
          onChange={(e) => updateField("devolucao", e.target.value)}
          rows={2}
        />
      </FieldWrapper>

      <Card
        variant="callout"
        tone="danger"
        size="sm"
        layout="inline"
      >
        <CardBody>
          <CardIcon>
            <CircleAlert />
          </CardIcon>
          <CardTitle>IMPORTANTE!</CardTitle>
          <CardContent>
            <p>
              Você não poderá doar a outra pessoa o animal adotado sem antes
              comunicar sua intenção ao protetor.
            </p>
          </CardContent>
        </CardBody>
      </Card>

      <FieldWrapper
        name="termo_nao_repassar"
        label="10.3. Concorda com o termo acima?"
        required
        errors={errors}
      >
        <FieldRadioGroup
          value={formData.termo_nao_repassar || ""}
          onValueChange={(val) => updateField("termo_nao_repassar", val)}
          className={styles.radioGroup}
        >
          <div className={styles.radioOption}>
            <RadioComponent.RadioGroupItem
              value="Sim"
              id="termo_repassar_sim"
            />
            <Label htmlFor="termo_repassar_sim">Sim</Label>
          </div>
          <div className={styles.radioOption}>
            <RadioComponent.RadioGroupItem
              value="Não"
              id="termo_repassar_nao"
            />
            <Label htmlFor="termo_repassar_nao">Não</Label>
          </div>
        </FieldRadioGroup>
      </FieldWrapper>

      <FieldWrapper
        name="obs"
        label="10.4. Espaço para observações"
        errors={errors}
      >
        <textarea
          id="obs"
          value={formData.obs || ""}
          onChange={(e) => updateField("obs", e.target.value)}
          rows={3}
        />
      </FieldWrapper>
    </div>
  );
}
