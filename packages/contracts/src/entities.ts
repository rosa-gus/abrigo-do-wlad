import { z } from "zod";
import { PUBLICATION_STATUSES } from "./publication";

export type { PublicationStatus } from "./publication";
export const publicationStatusSchema = z.enum(PUBLICATION_STATUSES);
export const PUBLICATION_LABELS = { draft: "Rascunho", published: "Publicado" };

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

function optionalDetail<T extends z.ZodType>(schema: T) {
  return z.union([z.literal(""), schema]);
}

const dogDraftFieldsSchema = dogWritableFieldsSchema.extend({
  idade: optionalDetail(dogAgeWriteSchema),
  cateIdade: optionalDetail(dogAgeCategorySchema),
  sexo: optionalDetail(dogSexSchema),
  temperamento: optionalDetail(dogTemperamentWriteSchema),
  status: optionalDetail(dogHealthStatusSchema),
  cor: z.string().trim().max(80),
  publicationStatus: publicationStatusSchema,
});

const dogInputFieldsSchema = dogDraftFieldsSchema.extend({
  idade: dogDraftFieldsSchema.shape.idade.default(""),
  cateIdade: dogDraftFieldsSchema.shape.cateIdade.default(""),
  sexo: dogDraftFieldsSchema.shape.sexo.default(""),
  temperamento: dogDraftFieldsSchema.shape.temperamento.default(""),
  status: dogDraftFieldsSchema.shape.status.default(""),
  cor: dogDraftFieldsSchema.shape.cor.default(""),
  tags: dogDraftFieldsSchema.shape.tags.default([]),
  fotos: dogDraftFieldsSchema.shape.fotos.default([]),
  instaLink: dogDraftFieldsSchema.shape.instaLink.default(""),
  descricaoCompleta: dogDraftFieldsSchema.shape.descricaoCompleta.default(""),
  publicationStatus: publicationStatusSchema.default("draft"),
});

function requirePublishedFields(
  data: { publicationStatus: string },
  context: z.RefinementCtx,
  schema: z.ZodType,
) {
  if (data.publicationStatus !== "published") return;
  const result = schema.safeParse(data);
  if (!result.success) {
    const labels: Record<string, string> = {
      nome: "o nome", idade: "a idade", cateIdade: "a categoria de idade",
      sexo: "o sexo", temperamento: "o temperamento", status: "a condição de saúde",
      cor: "a cor", zone: "a zona", neighborhood: "o bairro", address: "o endereço",
    };
    for (const issue of result.error.issues) {
      const field = String(issue.path[0]);
      const value = (data as Record<string, unknown>)[field];
      context.addIssue({ code: "custom", path: issue.path, message: value === "" && labels[field]
        ? `Informe ${labels[field]} para publicar.` : issue.message });
    }
  }
}

export const dogInputSchema = dogInputFieldsSchema.superRefine((data, context) =>
  requirePublishedFields(data, context, dogWritableFieldsSchema)
);

export const dogDetailsSchema = dogInputFieldsSchema.omit({ fotos: true })
  .superRefine((data, context) =>
    requirePublishedFields(data, context, dogWritableFieldsSchema.omit({ fotos: true }))
  );

export const dogUpdateSchema = dogDraftFieldsSchema.extend({
  expectedUpdateTime: z.string().datetime().optional(),
}).partial().refine(
  (value) => Object.keys(value).some(key => key !== "expectedUpdateTime"),
  "Informe ao menos um campo para atualizar o cachorro.",
);

export const dogEntitySchema = dogInputFieldsSchema.extend({
  // Only legacy records have the timestamp business ID. Document identity is canonical.
  id: z.number().int().nonnegative().optional(),
  documentId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
  archivedAt: z.string().datetime().nullish(),
  purgeAfter: z.string().datetime().nullish(),
  archiveReason: z.enum(["adopted_via_site", "other"]).nullish(),
  archivedBy: z.string().email().nullish(),
  adoptionCountedAt: z.string().datetime().nullish(),
  retainedPhotos: z.array(z.string()).optional(),
  schemaVersion: z.number().int().nonnegative().optional(),
  revision: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
  publishedAt: z.string().datetime().optional(),
  // Reads allow incomplete drafts and legacy values to be corrected manually.
  idade: optionalDetail(dogAgeReadSchema).default(""),
  temperamento: optionalDetail(dogTemperamentReadSchema).default(""),
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

const recyclePointDraftFieldsSchema = recyclePointWritableFieldsSchema.extend({
  zone: z.string().trim().max(80),
  neighborhood: z.string().trim().max(120),
  address: z.string().trim().max(300),
  publicationStatus: publicationStatusSchema,
});

const recyclePointInputFieldsSchema = recyclePointDraftFieldsSchema.extend({
  zone: recyclePointDraftFieldsSchema.shape.zone.default(""),
  neighborhood: recyclePointDraftFieldsSchema.shape.neighborhood.default(""),
  address: recyclePointDraftFieldsSchema.shape.address.default(""),
  name: recyclePointDraftFieldsSchema.shape.name.default(""),
  googleMapsUrl: recyclePointDraftFieldsSchema.shape.googleMapsUrl.default(""),
  publicationStatus: publicationStatusSchema.default("draft"),
});

export const recyclePointInputSchema = recyclePointInputFieldsSchema
  .superRefine((data, context) => {
    if (!data.name && !data.neighborhood) {
      context.addIssue({ code: "custom", path: ["name"], message: "Informe o nome do local ou o bairro para identificar o ponto." });
    }
    requirePublishedFields(data, context, recyclePointWritableFieldsSchema);
  });

export const recyclePointUpdateSchema = recyclePointDraftFieldsSchema.extend({
  expectedUpdateTime: z.string().datetime().optional(),
}).partial().refine(
  (value) => Object.keys(value).some(key => key !== "expectedUpdateTime"),
  "Informe ao menos um campo para atualizar o ponto de coleta.",
);

export const recyclePointEntitySchema = recyclePointInputFieldsSchema.extend({
  id: z.string().trim().min(1),
  schemaVersion: z.number().int().nonnegative().optional(),
  revision: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
  publishedAt: z.string().datetime().optional(),
});

export type DogInput = z.infer<typeof dogInputSchema>;
export type DogDetailsInput = z.infer<typeof dogDetailsSchema>;
export type DogUpdate = z.infer<typeof dogUpdateSchema>;
export type Dog = z.infer<typeof dogEntitySchema>;
export type DogHealthStatus = (typeof DOG_HEALTH_STATUSES)[number];

export type RecyclePointInput = z.infer<typeof recyclePointInputSchema>;
export type RecyclePointUpdate = z.infer<typeof recyclePointUpdateSchema>;
export type RecyclePoint = z.infer<typeof recyclePointEntitySchema>;
