import { DOG_TAG_VALUES, type DogTag } from "@abrigo/contracts/entities";

export {
  DOG_HEALTH_STATUSES,
  DOG_TAG_VALUES,
  MAX_DOG_AGE_MONTHS,
  MAX_DOG_AGE_YEARS,
  MAX_DOG_PHOTOS,
  MAX_DOG_TAGS,
  MAX_DOG_TEMPERAMENT_LENGTH,
} from "@abrigo/contracts/entities";
export type {
  Dog as DogProps,
  DogDetailsInput,
  DogHealthStatus,
  DogTag,
  DogAgeParts,
  DogAgeUnit,
  DogInput,
  DogUpdate,
} from "@abrigo/contracts/entities";

export const CORES_MAP: Record<string, string> = {
  caramelo: "Caramelo (Patrimônio Nacional)",
  pretinho: "Pretinho (Nada Básico)",
  fiapoManga: "Fiapo de Manga (Arrepiados)",
  peludinhos: "Peludinhos",
  BrasilEgito: "Mistura do Brasil com Egito",
};

const DOG_TAG_LABELS: Record<DogTag, string> = {
  docil: "Dócil",
  brincalhao: "Brincalhão",
  medroso: "Medroso",
  ativo: "Ativo",
  tranquilo: "Tranquilo",
  sociavel: "Sociável",
  resiliente: "Resiliente",
  carinhoso: "Carinhoso",
  amavel: "Amável",
  curioso: "Curioso",
  timido: "Tímido",
  independente: "Independente",
  protetor: "Protetor",
  companheiro: "Companheiro",
  adaptavel: "Adaptável",
};

export const DOG_TAGS = DOG_TAG_VALUES.map((value) => ({
  value,
  label: DOG_TAG_LABELS[value],
}));
