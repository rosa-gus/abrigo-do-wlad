import type { PublicDog } from "@abrigo/contracts/public";
export const CORES_MAP: Record<string, string> = {
  caramelo: "Caramelo (Patrimônio Nacional)",
  pretinho: "Pretinho (Nada Básico)",
  fiapoManga: "Fiapo de Manga (Arrepiados)",
  peludinhos: "Peludinhos",
  BrasilEgito: "Mistura do Brasil com Egito",
};

export const DOG_TAG_OPTIONS = [
  {
    value: "docil",
    label: "Dócil",
    description: "Gentil e receptivo no convívio.",
  },
  {
    value: "brincalhao",
    label: "Brincalhão",
    description: "Gosta de interações, jogos e diversão.",
  },
  {
    value: "medroso",
    label: "Medroso",
    description: "Precisa de aproximação calma e paciente.",
  },
  {
    value: "ativo",
    label: "Ativo",
    description: "Tem energia para passeios e atividades.",
  },
  {
    value: "tranquilo",
    label: "Tranquilo",
    description: "Prefere uma rotina mais calma.",
  },
  {
    value: "sociavel",
    label: "Sociável",
    description: "Interage bem com pessoas ou outros animais.",
  },
  {
    value: "resiliente",
    label: "Resiliente",
    description: "Recupera-se bem de mudanças e desafios.",
  },
  {
    value: "carinhoso",
    label: "Carinhoso",
    description: "Busca proximidade, contato e atenção.",
  },
  {
    value: "amavel",
    label: "Amável",
    description: "Demonstra afeto e comportamento gentil.",
  },
  {
    value: "curioso",
    label: "Curioso",
    description: "Explora ambientes e novidades com interesse.",
  },
  {
    value: "timido",
    label: "Tímido",
    description: "Leva algum tempo para ganhar confiança.",
  },
  {
    value: "independente",
    label: "Independente",
    description: "Lida bem com momentos mais reservados.",
  },
  {
    value: "protetor",
    label: "Protetor",
    description: "É atento ao ambiente e aos seus vínculos.",
  },
  {
    value: "companheiro",
    label: "Companheiro",
    description: "Gosta de permanecer perto da família.",
  },
  {
    value: "adaptavel",
    label: "Adaptável",
    description: "Ajusta-se com facilidade a novas rotinas.",
  },
] as const;

export type DogTag = (typeof DOG_TAG_OPTIONS)[number]["value"];

export type DogTagCounts = Partial<Record<DogTag, number>>;

export const TAGS_MAP = Object.fromEntries(
  DOG_TAG_OPTIONS.map(({ value, label }) => [value, label]),
) as Record<DogTag, string>;

export const DOG_HEALTH_STATUSES = [
  "Vacinado e Castrado",
  "Apenas Castrado",
  "Em Protocolo Vacinal",
] as const;

export type DogHealthStatus = (typeof DOG_HEALTH_STATUSES)[number];

export interface Dog extends PublicDog<DogHealthStatus> { createdAt?: Date }
export type { DogTombstone } from "@abrigo/contracts/public";
export type DogProfile = import("@abrigo/contracts/public").DogProfile<Dog>;

type FilterValue<T> = T | "all";

export type DogFilters = {
  cateIdade?: FilterValue<Dog["cateIdade"]>;
  cor?: FilterValue<Dog["cor"]>;
  tags?: DogTag[];
};
