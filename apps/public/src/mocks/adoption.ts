import type {
  FormData,
  Step1Data,
  Step2Data,
  Step3Data,
  Step4Data,
  Step5Data,
  Step6Data,
  Step7Data,
  Step8Data,
  Step9Data,
  Step10Data,
} from "../pages/BetaForm/components/WizardForm/schema";

export const VALID_STEP_1 = {
  nome_adotante: "Pessoa Candidata Teste",
  idade: 30,
  estado_civil: "Solteiro",
  profissao: "Profissional de teste",
  empresa: "Organização fictícia",
  endereco: "Rua Exemplo, 100, Morumbi, São Paulo - SP",
  telefone: "(11) 90000-0000",
  email: "candidatura@example.test",
  redes_sociais: "@candidatura_teste",
} satisfies Step1Data;

export const VALID_STEP_2 = {
  qtd_adultos: 2,
  criancas: "Não há crianças na residência",
  renda_mensal: "Faixa de renda sintética",
  acordo: "Sim",
  alergia: "Nenhuma alergia conhecida",
} satisfies Step2Data;

export const VALID_STEP_3 = {
  motivo: "Deseja oferecer um lar responsável e seguro",
  animal_especifico: "Cão de teste",
  porte: "Medio",
  sexo: "Não importa",
  idade_animal: "Adulto Jovem",
  personalidade: "Brincalhao",
  atividade: "Companhia",
} satisfies Step3Data;

export const VALID_STEP_4 = {
  responsavel: "Pessoa candidata",
  horas_sozinho: "Até quatro horas por dia",
  passeios: "Dois passeios diários",
  tipo_moradia: "Propria",
  proprietario_permite: "Nao aplica",
  detalhes_moradia: "Casa quintal",
  moradores: "Duas pessoas adultas",
  areas_frequentar: "Áreas internas e quintal seguro",
  periodos: "Manhã, tarde e noite",
  dormir: "Dentro da residência",
  acesso: "Total",
} satisfies Step4Data;

export const VALID_STEP_5 = {
  outros_animais: "Não há outros animais atualmente",
  castrados: "Não se aplica",
  ja_teve: "Já cuidou de animais anteriormente",
  destino_antigos: "Viveram com a família até a velhice",
  veterinario: "Clínica veterinária fictícia",
  racao: "Ração adequada à orientação veterinária",
} satisfies Step5Data;

export const VALID_STEP_6 = {
  coleira: "Sim",
  ciencia_adaptacao: "Sim",
  tempo_adaptacao: "O tempo necessário para uma adaptação segura",
  adestrador: "Sim",
  motivo_nao_adestrar: "Nao se aplica",
  carro: "Sim",
  financeiro_vet: "Sim",
  vacinas: "Sim",
  gasto_mensal: "acima 300",
} satisfies Step6Data;

export const VALID_STEP_7 = {
  divulgacao: "Publicação fictícia nas redes sociais",
  noticias: "Sim",
  visitas: "Sim",
  fotos_adocao: "Sim",
  contribuicao: "Sim",
  compromisso_vida: "Sim",
} satisfies Step7Data;

export const VALID_STEP_8 = {
  gravidez: "O animal continuará fazendo parte da família",
  viagem: "Ficará com uma pessoa responsável e conhecida",
  mudanca_menor: "A rotina será adaptada ao novo espaço",
  mudanca_longe: "O animal acompanhará a mudança com segurança",
  separacao: "A responsabilidade será definida priorizando o animal",
  falecimento: "Uma pessoa responsável assumirá os cuidados",
} satisfies Step8Data;

export const VALID_STEP_9 = {
  perder: "Procurará imediatamente e divulgará na região",
  doenca: "Buscará atendimento veterinário",
  morder: "Investigará a causa com apoio profissional",
  destruicao: "Trabalhará manejo, ambiente e treinamento",
  xixi_errado: "Reforçará a rotina e buscará orientação",
} satisfies Step9Data;

export const VALID_STEP_10 = {
  enxoval: "Preparará todos os itens antes da chegada",
  devolucao: "Entrará em contato com o abrigo antes de qualquer decisão",
  termo_nao_repassar: "Sim",
  obs: "Candidatura completamente sintética para testes automatizados",
} satisfies Step10Data;

export const VALID_STEP_DATA = [
  VALID_STEP_1,
  VALID_STEP_2,
  VALID_STEP_3,
  VALID_STEP_4,
  VALID_STEP_5,
  VALID_STEP_6,
  VALID_STEP_7,
  VALID_STEP_8,
  VALID_STEP_9,
  VALID_STEP_10,
] as const;

export const SAMPLE_ADOPTION_FORM_DATA = {
  ...VALID_STEP_1,
  ...VALID_STEP_2,
  ...VALID_STEP_3,
  ...VALID_STEP_4,
  ...VALID_STEP_5,
  ...VALID_STEP_6,
  ...VALID_STEP_7,
  ...VALID_STEP_8,
  ...VALID_STEP_9,
  ...VALID_STEP_10,
} satisfies Omit<FormData, "captchaToken">;

export const VALID_ADOPTION_APPLICATION = {
  ...SAMPLE_ADOPTION_FORM_DATA,
  captchaToken: "synthetic-captcha-token",
} satisfies FormData;

export function buildValidAdoptionApplication(
  overrides: Partial<FormData> = {},
): FormData {
  return {
    ...VALID_ADOPTION_APPLICATION,
    ...overrides,
  };
}
