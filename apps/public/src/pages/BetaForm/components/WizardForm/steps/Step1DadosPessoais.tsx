import { FieldWrapper } from "../FieldWrapper";
import type { FormData } from "../schema";
import type { FieldError } from "../useWizardForm";
import styles from "../WizardForm.module.css";
import * as SelectComponent from "@jaci/ui/Select";
import { FieldSelectTrigger } from "../FieldControls";

interface StepProps {
  formData: Partial<FormData>;
  errors: FieldError;
  updateField: (field: keyof FormData, value: string | number) => void;
}

export function Step1DadosPessoais({
  formData,
  errors,
  updateField,
}: StepProps) {
  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, "");
    if (value.length > 11) value = value.slice(0, 11);
    value = value.replace(/^(\d{2})(\d)/g, "($1) $2");
    value = value.replace(/(\d)(\d{4})$/, "$1-$2");
    updateField("telefone", value);
  };

  return (
    <div className={styles.stepContent}>
      <FieldWrapper
        name="nome_adotante"
        label="1.1. Nome do adotante"
        required
        errors={errors}
      >
        <input
          type="text"
          id="nome_adotante"
          autoComplete="name"
          value={formData.nome_adotante || ""}
          onChange={(e) => updateField("nome_adotante", e.target.value)}
          placeholder="Seu nome completo"
        />
      </FieldWrapper>

      <div className={styles.fieldRow}>
        <FieldWrapper name="idade" label="1.2. Idade" required errors={errors}>
          <input
            type="number"
            id="idade"
            value={formData.idade || ""}
            onChange={(e) => updateField("idade", e.target.value)}
            placeholder="Sua idade"
            min={18}
          />
        </FieldWrapper>

        <FieldWrapper
          name="estado_civil"
          label="1.3. Estado Civil"
          required
          errors={errors}
        >
          <SelectComponent.Select
            value={formData.estado_civil || ""}
            onValueChange={(val) => updateField("estado_civil", val)}
          >
            <FieldSelectTrigger>
              <SelectComponent.SelectValue placeholder="Selecione" />
            </FieldSelectTrigger>
            <SelectComponent.SelectContent>
              <SelectComponent.SelectItem value="Solteiro">
                Solteiro (a)
              </SelectComponent.SelectItem>
              <SelectComponent.SelectItem value="Casado/Uniao">
                Casado (a) ou União Estável
              </SelectComponent.SelectItem>
              <SelectComponent.SelectItem value="Separado">
                Separado (a) ou divorciado (a)
              </SelectComponent.SelectItem>
              <SelectComponent.SelectItem value="Viuvo">
                Viúvo (a)
              </SelectComponent.SelectItem>
            </SelectComponent.SelectContent>
          </SelectComponent.Select>
        </FieldWrapper>
      </div>

      <div className={styles.fieldRow}>
        <FieldWrapper
          name="profissao"
          label="1.4. Profissão"
          required
          errors={errors}
        >
          <input
            type="text"
            id="profissao"
            autoComplete="organization-title"
            value={formData.profissao || ""}
            onChange={(e) => updateField("profissao", e.target.value)}
          />
        </FieldWrapper>

        <FieldWrapper
          name="empresa"
          label="1.5. Empresa onde trabalha"
          required
          errors={errors}
        >
          <input
            type="text"
            id="empresa"
            autoComplete="organization"
            value={formData.empresa || ""}
            onChange={(e) => updateField("empresa", e.target.value)}
          />
        </FieldWrapper>
      </div>

      <FieldWrapper
        name="endereco"
        label="1.6. Endereço completo (com bairro e cidade)"
        required
        errors={errors}
      >
        <input
          type="text"
          id="endereco"
          autoComplete="street-address"
          value={formData.endereco || ""}
          onChange={(e) => updateField("endereco", e.target.value)}
          placeholder="Rua, Número, Bairro, Cidade..."
        />
      </FieldWrapper>

      <div className={styles.fieldRow}>
        <FieldWrapper
          name="telefone"
          label="1.7. Telefone (WhatsApp)"
          required
          errors={errors}
        >
          <input
            type="tel"
            id="telefone"
            inputMode="tel"
            autoComplete="tel"
            value={formData.telefone || ""}
            onChange={handlePhoneChange}
            placeholder="(XX) XXXXX-XXXX"
            maxLength={15}
          />
        </FieldWrapper>

        <FieldWrapper name="email" label="1.8. E-mail" required errors={errors}>
          <input
            type="email"
            id="email"
            autoComplete="email"
            value={formData.email || ""}
            onChange={(e) => updateField("email", e.target.value)}
          />
        </FieldWrapper>
      </div>

      <FieldWrapper
        name="redes_sociais"
        label="1.9. Perfil(s) em redes sociais"
        required
        errors={errors}
      >
        <input
          type="text"
          id="redes_sociais"
          value={formData.redes_sociais || ""}
          onChange={(e) => updateField("redes_sociais", e.target.value)}
          placeholder="Instagram / Facebook"
        />
      </FieldWrapper>
    </div>
  );
}
