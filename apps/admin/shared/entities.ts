import { z } from "zod";

export const MAX_DOG_PHOTOS = 6;
export const MAX_DOG_TAGS = 5;
export const MAX_DOG_TEMPERAMENT_LENGTH = 80;
export const MAX_DOG_AGE_YEARS = 30;
export const MAX_DOG_AGE_MONTHS = MAX_DOG_AGE_YEARS * 12;

export const DOG_AGE_CATEGORIES = ["filhote", "adulto", "idoso"] as const;
export const DOG_AGE_UNITS = ["anos", "meses"] as const;
export const DOG_SEXES = ["Macho", "Fêmea"] as const;
export const DOG_HEALTH_STATUSES = [
  "Vacinado e Castrado",
  "Apenas Castrado",
  "Em Protocolo Vacinal",
] as const;
export const DOG_TAG_VALUES = [
  "docil",
  "brincalhao",
  "medroso",
  "ativo",
  "tranquilo",
  "sociavel",
  "resiliente",
  "carinhoso",
  "amavel",
  "curioso",
  "timido",
  "independente",
  "protetor",
  "companheiro",
  "adaptavel",
] as const;

export const dogAgeCategorySchema = z.enum(DOG_AGE_CATEGORIES);
export const dogSexSchema = z.enum(DOG_SEXES);
export const dogHealthStatusSchema = z.enum(DOG_HEALTH_STATUSES);
export type DogTag = (typeof DOG_TAG_VALUES)[number];

export function normalizeDogTag(value: string): DogTag | null {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .trim();
  return DOG_TAG_VALUES.find((tag) => tag === normalized) ?? null;
}

const dogTagSchema = z
  .string()
  .trim()
  .min(1)
  .max(60)
  .transform(normalizeDogTag)
  .refine((value): value is DogTag => value !== null, "Informe uma tag válida.");

export type DogAgeUnit = (typeof DOG_AGE_UNITS)[number];

export interface DogAgeParts {
  range: string;
  unit: DogAgeUnit;
}

export function formatDogAge(range: string, unit: DogAgeUnit): string {
  if (!range) return "";

  const [minimum, maximum] = range.split("-");
  const normalizedRange = maximum === minimum ? minimum : range;
  const singular = normalizedRange === "1";
  const suffix = unit === "anos"
    ? singular ? "ano" : "anos"
    : singular ? "mês" : "meses";
  return `${normalizedRange} ${suffix}`;
}

export function parseDogAge(value: string): DogAgeParts | null {
  const normalized = value.trim();
  const match = /^(\d+)(?:-(\d+))? (ano|anos|mês|meses)$/.exec(normalized);
  if (!match) return null;

  const minimum = Number(match[1]);
  const maximum = match[2] === undefined ? undefined : Number(match[2]);
  const unit: DogAgeUnit = match[3]?.startsWith("ano") ? "anos" : "meses";
  const upperLimit = unit === "anos" ? MAX_DOG_AGE_YEARS : MAX_DOG_AGE_MONTHS;
  if (
    !Number.isSafeInteger(minimum)
    || minimum < 1
    || minimum > upperLimit
    || (maximum !== undefined && (
      !Number.isSafeInteger(maximum)
      || maximum < minimum
      || maximum > upperLimit
    ))
  ) {
    return null;
  }

  const range = maximum === undefined ? String(minimum) : `${minimum}-${maximum}`;
  return formatDogAge(range, unit) === normalized ? { range, unit } : null;
}

const httpsUrlSchema = z
  .string()
  .trim()
  .max(2_048, "A URL deve ter no máximo 2048 caracteres.")
  .url("Informe uma URL válida.")
  .refine((value) => value.startsWith("https://"), "A URL deve usar HTTPS.");

const dogTemperamentWriteSchema = z
  .string()
  .trim()
  .min(1, "Informe o temperamento do cachorro.")
  .max(
    MAX_DOG_TEMPERAMENT_LENGTH,
    `O temperamento deve ter no máximo ${MAX_DOG_TEMPERAMENT_LENGTH} caracteres.`,
  );

const dogTemperamentReadSchema = z
  .string()
  .trim()
  .min(1, "Informe o temperamento do cachorro.");

const dogAgeWriteSchema = z.string().trim().refine(
  (value) => parseDogAge(value) !== null,
  "Informe uma idade válida, como 1 ano, 8 meses ou 2-3 anos.",
);

const dogAgeReadSchema = z
  .string()
  .trim()
  .min(1, "Informe a idade do cachorro.")
  .max(80);

const dogWritableFieldsSchema = z.object({
  nome: z.string().trim().min(1, "Informe o nome do cachorro.").max(120),
  idade: dogAgeWriteSchema,
  cateIdade: dogAgeCategorySchema,
  sexo: dogSexSchema,
  temperamento: dogTemperamentWriteSchema,
  tags: z
    .array(dogTagSchema)
    .max(MAX_DOG_TAGS, `Um cachorro pode ter no máximo ${MAX_DOG_TAGS} tags.`),
  status: dogHealthStatusSchema,
  fotos: z
    .array(httpsUrlSchema)
    .max(MAX_DOG_PHOTOS, `Um cachorro pode ter no máximo ${MAX_DOG_PHOTOS} fotos.`),
  cor: z.string().trim().min(1, "Informe a cor do cachorro.").max(80),
  instaLink: z.union([z.literal(""), httpsUrlSchema]),
  descricaoCompleta: z.string().trim().max(5_000),
});

export const dogInputSchema = dogWritableFieldsSchema.extend({
  instaLink: dogWritableFieldsSchema.shape.instaLink.default(""),
  descricaoCompleta: dogWritableFieldsSchema.shape.descricaoCompleta.default(""),
});

export const dogDetailsSchema = dogInputSchema.omit({ fotos: true });

export const dogUpdateSchema = dogWritableFieldsSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  "Informe ao menos um campo para atualizar o cachorro.",
);

export const dogEntitySchema = dogInputSchema.extend({
  id: z.number().int().nonnegative(),
  archivedAt: z.string().datetime().nullish(),
  purgeAfter: z.string().datetime().nullish(),
  archiveReason: z.enum(["adopted_via_site", "other"]).nullish(),
  archivedBy: z.string().email().nullish(),
  adoptionCountedAt: z.string().datetime().nullish(),
  retainedPhotos: z.array(z.string()).optional(),
  // Reads stay tolerant so legacy records can be opened and corrected manually.
  idade: dogAgeReadSchema,
  temperamento: dogTemperamentReadSchema,
});

const GOOGLE_MAPS_HOSTS = new Set([
  "google.com",
  "www.google.com",
  "maps.google.com",
  "google.com.br",
  "www.google.com.br",
  "maps.google.com.br",
]);

function isGoogleMapsUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  if (url.protocol !== "https:") return false;

  const hostname = url.hostname.toLowerCase();
  if (hostname === "maps.app.goo.gl") return url.pathname !== "/";
  if (hostname === "goo.gl") {
    return url.pathname === "/maps" || url.pathname.startsWith("/maps/");
  }

  if (!GOOGLE_MAPS_HOSTS.has(hostname)) return false;
  return hostname.startsWith("maps.")
    || url.pathname === "/maps"
    || url.pathname.startsWith("/maps/");
}

const googleMapsUrlSchema = z
  .string()
  .trim()
  .max(2_048, "O link deve ter no máximo 2048 caracteres.")
  .refine(
    (value) => value === "" || isGoogleMapsUrl(value),
    "Informe um link HTTPS válido do Google Maps.",
  );

const recyclePointWritableFieldsSchema = z.object({
  zone: z.string().trim().min(1, "Informe a zona da cidade.").max(80),
  neighborhood: z.string().trim().min(1, "Informe o bairro.").max(120),
  name: z.string().trim().max(160),
  address: z.string().trim().min(1, "Informe o endereço.").max(300),
  googleMapsUrl: googleMapsUrlSchema,
});

export const recyclePointInputSchema = recyclePointWritableFieldsSchema.extend({
  name: recyclePointWritableFieldsSchema.shape.name.default(""),
  googleMapsUrl: recyclePointWritableFieldsSchema.shape.googleMapsUrl.default(""),
});

export const recyclePointUpdateSchema = recyclePointWritableFieldsSchema
  .partial()
  .refine(
    (value) => Object.keys(value).length > 0,
    "Informe ao menos um campo para atualizar o ponto de coleta.",
  );

export const recyclePointEntitySchema = recyclePointWritableFieldsSchema.extend({
  id: z.string().trim().min(1),
  name: recyclePointWritableFieldsSchema.shape.name.default(""),
  googleMapsUrl: recyclePointWritableFieldsSchema.shape.googleMapsUrl.default(""),
});

export type DogInput = z.infer<typeof dogInputSchema>;
export type DogDetailsInput = z.infer<typeof dogDetailsSchema>;
export type DogUpdate = z.infer<typeof dogUpdateSchema>;
export type Dog = z.infer<typeof dogEntitySchema>;
export type DogHealthStatus = (typeof DOG_HEALTH_STATUSES)[number];

export type RecyclePointInput = z.infer<typeof recyclePointInputSchema>;
export type RecyclePointUpdate = z.infer<typeof recyclePointUpdateSchema>;
export type RecyclePoint = z.infer<typeof recyclePointEntitySchema>;
