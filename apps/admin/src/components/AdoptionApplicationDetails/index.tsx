import type { LucideIcon } from "lucide-react";
import {
  CheckCircle,
  Dog,
  FileText,
  HelpCircle,
  Home,
  MessageCircleQuestion,
  ShieldCheck,
  Stethoscope,
  User,
  Users,
} from "lucide-react";
import type { AdoptionRequest } from "../../types/adoptions";
import styles from "./AdoptionApplicationDetails.module.css";

interface AdoptionField {
  key: keyof AdoptionRequest;
  label: string;
}

export interface AdoptionReviewStep {
  label: string;
  icon: LucideIcon;
  fields: readonly AdoptionField[];
}

// Immutable review metadata is colocated with its renderer to prevent field-order drift.
// eslint-disable-next-line react-refresh/only-export-components
export const ADOPTION_REVIEW_STEPS: readonly AdoptionReviewStep[] = [
  {
    label: "Dados Pessoais",
    icon: User,
    fields: [
      { key: "nome_adotante", label: "1.1. Nome do adotante" },
      { key: "idade", label: "1.2. Idade" },
      { key: "estado_civil", label: "1.3. Estado Civil" },
      { key: "profissao", label: "1.4. Profissão" },
      { key: "empresa", label: "1.5. Empresa onde trabalha" },
      { key: "endereco", label: "1.6. Endereço completo" },
      { key: "telefone", label: "1.7. Telefone (WhatsApp)" },
      { key: "email", label: "1.8. E-mail" },
      { key: "redes_sociais", label: "1.9. Perfil em redes sociais" },
    ],
  },
  {
    label: "Família e Renda",
    icon: Users,
    fields: [
      { key: "qtd_adultos", label: "2.1. Quantos adultos na casa?" },
      { key: "criancas", label: "2.2. Quantas crianças? Quais idades?" },
      { key: "renda_mensal", label: "2.3. Renda mensal da família" },
      { key: "acordo", label: "2.4. Todos estão de acordo com a adoção?" },
      { key: "alergia", label: "2.5. Há alergia ou resistência a animais?" },
    ],
  },
  {
    label: "Sobre a Adoção",
    icon: Dog,
    fields: [
      { key: "motivo", label: "3.1. Motivo da adoção" },
      { key: "animal_especifico", label: "3.2. Animal específico" },
      { key: "porte", label: "3.3.1. Porte" },
      { key: "sexo", label: "3.3.2. Sexo" },
      { key: "idade_animal", label: "3.3.3. Idade" },
      { key: "personalidade", label: "3.3.4. Personalidade" },
      { key: "atividade", label: "3.3.5. Atividade principal" },
    ],
  },
  {
    label: "Rotina e Moradia",
    icon: Home,
    fields: [
      { key: "responsavel", label: "4.1. Principal responsável" },
      { key: "horas_sozinho", label: "4.2. Horas sozinho por dia" },
      { key: "passeios", label: "4.3. Rotina de passeios" },
      { key: "tipo_moradia", label: "4.4. Tipo de moradia" },
      { key: "proprietario_permite", label: "4.5. Proprietário permite animais?" },
      { key: "detalhes_moradia", label: "4.6. Detalhes da moradia" },
      { key: "moradores", label: "4.7. Quem mora na residência?" },
      { key: "areas_frequentar", label: "4.8. Áreas que poderá frequentar" },
      { key: "periodos", label: "4.9. Períodos de acesso" },
      { key: "dormir", label: "4.10. Onde irá dormir?" },
      { key: "acesso", label: "4.11. Acesso aos cômodos" },
    ],
  },
  {
    label: "Histórico e Veterinário",
    icon: Stethoscope,
    fields: [
      { key: "outros_animais", label: "5.1. Tem outros animais?" },
      { key: "castrados", label: "5.2. Estão castrados?" },
      { key: "ja_teve", label: "5.3. Já teve outros animais?" },
      { key: "destino_antigos", label: "5.4. Destino dos animais anteriores" },
      { key: "veterinario", label: "5.5. Veterinário ou clínica" },
      { key: "racao", label: "5.6. Ração pretendida" },
    ],
  },
  {
    label: "Responsabilidades",
    icon: ShieldCheck,
    fields: [
      { key: "coleira", label: "6.1. Coleira de identificação" },
      { key: "ciencia_adaptacao", label: "6.2. Ciência da adaptação" },
      { key: "tempo_adaptacao", label: "6.3. Tempo esperado de adaptação" },
      { key: "adestrador", label: "6.4. Contrataria adestrador?" },
      { key: "motivo_nao_adestrar", label: "6.5. Motivo para não contratar" },
      { key: "carro", label: "6.6. Possui carro?" },
      { key: "financeiro_vet", label: "6.7. Emergência veterinária" },
      { key: "vacinas", label: "6.8. Vacinação e vermífugo" },
      { key: "gasto_mensal", label: "6.9. Previsão de gasto mensal" },
    ],
  },
  {
    label: "Termos Finais",
    icon: FileText,
    fields: [
      { key: "divulgacao", label: "7.1. Onde viu a divulgação?" },
      { key: "noticias", label: "7.2. Aceita mandar notícias?" },
      { key: "visitas", label: "7.3. Aceita visitas do protetor?" },
      { key: "fotos_adocao", label: "7.4. Permite fotos da adoção?" },
      { key: "contribuicao", label: "7.5. Concorda com a taxa de adoção?" },
      { key: "compromisso_vida", label: "7.6. Preparado para o compromisso?" },
    ],
  },
  {
    label: "O que acontecerá se...",
    icon: HelpCircle,
    fields: [
      { key: "gravidez", label: "8.1. Alguém engravidar?" },
      { key: "viagem", label: "8.2. A família viajar?" },
      { key: "mudanca_menor", label: "8.3. Mudança para casa menor?" },
      { key: "mudanca_longe", label: "8.4. Mudança de cidade ou país?" },
      { key: "separacao", label: "8.5. Separação do casal?" },
      { key: "falecimento", label: "8.6. Falecimento do responsável?" },
    ],
  },
  {
    label: "O que faria se o animal...",
    icon: MessageCircleQuestion,
    fields: [
      { key: "perder", label: "9.1. Se perdesse?" },
      { key: "doenca", label: "9.2. Adoecesse ou sofresse acidente?" },
      { key: "morder", label: "9.3. Mordesse alguém?" },
      { key: "destruicao", label: "9.4. Destruísse objetos de valor?" },
      { key: "xixi_errado", label: "9.5. Fizesse necessidades no lugar errado?" },
    ],
  },
  {
    label: "Finalização",
    icon: CheckCircle,
    fields: [
      { key: "enxoval", label: "10.1. O que comprará para recebê-lo?" },
      { key: "devolucao", label: "10.2. Em que condição devolveria o animal?" },
      { key: "termo_nao_repassar", label: "10.3. Concorda em não repassar?" },
      { key: "obs", label: "10.4. Observações" },
    ],
  },
];

function splitFieldLabel(label: string): { number: string | null; question: string } {
  const match = label.match(/^((?:\d+\.)*\d+)\.\s+(.+)$/);

  if (!match) return { number: null, question: label };

  return {
    number: match[1],
    question: match[2],
  };
}

function DataItem({ label, value }: { label: string; value?: string | number }) {
  const displayValue = value == null ? "" : String(value);
  const hasValue = Boolean(displayValue.trim());
  const { number, question } = splitFieldLabel(label);

  return (
    <div className={styles.dataGroup}>
      <dt className={styles.dataLabel}>
        {number && <span className={styles.fieldNumber}>{number}.</span>}
        <span className={styles.fieldQuestion}>{question}</span>
      </dt>
      <dd className={`${styles.dataValue} ${!hasValue ? styles.missingValue : ""}`}>
        {hasValue ? displayValue : "Não informado"}
      </dd>
    </div>
  );
}

export function AdoptionDetailsSection({
  application,
  step,
  showTitle = false,
}: {
  application: AdoptionRequest;
  step: AdoptionReviewStep;
  showTitle?: boolean;
}) {
  return (
    <section className={styles.section}>
      {showTitle && <h2 className={styles.sectionTitle}>{step.label}</h2>}
      <dl className={styles.dataGrid}>
        {step.fields.map((field) => (
          <DataItem
            key={field.key}
            label={field.label}
            value={application[field.key]}
          />
        ))}
      </dl>
    </section>
  );
}
