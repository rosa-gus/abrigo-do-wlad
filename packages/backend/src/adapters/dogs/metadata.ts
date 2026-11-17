import {
  getOptimizedImageUrl,
  isCloudinaryImageUrl,
} from "@abrigo/media/cloudinary";

import type { PublicDog } from "./feed";
import { dogProfilePath } from "./public-slug";
import type { DogTombstone } from "./tombstone";

const SITE_ORIGIN = "https://abrigodowlad.com.br";
const DEFAULT_IMAGE_URL = `${SITE_ORIGIN}/og-image.jpg`;
const DEFAULT_IMAGE_ALT =
  "Abrigo do Wlad, projeto independente de proteção animal";
const DESCRIPTION_MAX_LENGTH = 180;

export interface DogPageMetadata {
  title: string;
  description: string;
  canonicalUrl: string;
  imageUrl: string;
  imageAlt: string;
  imageWidth: number;
  imageHeight: number;
  robots: string;
}

function normalizeDescription(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= DESCRIPTION_MAX_LENGTH) return normalized;

  const candidate = normalized.slice(0, DESCRIPTION_MAX_LENGTH - 1);
  const lastSpace = candidate.lastIndexOf(" ");
  const truncated = lastSpace >= 120 ? candidate.slice(0, lastSpace) : candidate;
  return `${truncated.trimEnd()}…`;
}

function canonicalDogUrl(publicSlug: string): string {
  return `${SITE_ORIGIN}${dogProfilePath(publicSlug)}`;
}

export function availableDogMetadata(dog: PublicDog): DogPageMetadata {
  const originalImage = dog.fotos[0];
  const hasShareImage = isCloudinaryImageUrl(originalImage);
  const imageUrl = hasShareImage
    ? getOptimizedImageUrl(originalImage, {
      width: 1200,
      height: 630,
      crop: "fill",
      gravity: "auto",
      quality: 85,
      format: "jpg",
    })
    : DEFAULT_IMAGE_URL;
  const fallbackDescription =
    `Conheça ${dog.nome}, ${dog.idade}, e veja como iniciar uma adoção ` +
    "responsável pelo Abrigo do Wlad.";

  return {
    title: `${dog.nome} para adoção | Abrigo do Wlad`,
    description: normalizeDescription(
      dog.descricaoCompleta?.trim() || fallbackDescription,
    ),
    canonicalUrl: canonicalDogUrl(dog.publicSlug),
    imageUrl,
    imageAlt: hasShareImage
      ? `Foto de ${dog.nome}, cão disponível para adoção no Abrigo do Wlad`
      : DEFAULT_IMAGE_ALT,
    imageWidth: hasShareImage ? 1200 : 1600,
    imageHeight: hasShareImage ? 630 : 900,
    robots: "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1",
  };
}

export function unavailableDogMetadata(
  tombstone: DogTombstone,
): DogPageMetadata {
  const adopted = tombstone.status === "adopted";

  return {
    title: adopted
      ? `${tombstone.nome} encontrou uma família | Abrigo do Wlad`
      : `${tombstone.nome} não está mais disponível | Abrigo do Wlad`,
    description: adopted
      ? `${tombstone.nome} já encontrou uma família. Conheça outros cães que aguardam uma adoção responsável no Abrigo do Wlad.`
      : `${tombstone.nome} não está mais disponível. Conheça outros cães que aguardam uma adoção responsável no Abrigo do Wlad.`,
    canonicalUrl: canonicalDogUrl(tombstone.publicSlug),
    imageUrl: DEFAULT_IMAGE_URL,
    imageAlt: DEFAULT_IMAGE_ALT,
    imageWidth: 1600,
    imageHeight: 900,
    robots: "noindex, follow",
  };
}

export function missingDogMetadata(): DogPageMetadata {
  return {
    title: "Doguinho não encontrado | Abrigo do Wlad",
    description:
      "Este perfil não foi encontrado. Conheça os cães disponíveis para adoção responsável no Abrigo do Wlad.",
    canonicalUrl: `${SITE_ORIGIN}/caes`,
    imageUrl: DEFAULT_IMAGE_URL,
    imageAlt: DEFAULT_IMAGE_ALT,
    imageWidth: 1600,
    imageHeight: 900,
    robots: "noindex, nofollow",
  };
}

export function unavailableServiceMetadata(): DogPageMetadata {
  return {
    ...missingDogMetadata(),
    title: "Perfis temporariamente indisponíveis | Abrigo do Wlad",
    description:
      "Os perfis dos cães estão temporariamente indisponíveis. Tente novamente em alguns instantes.",
  };
}

function attributeHandler(
  attribute: string,
  value: string,
): HTMLRewriterElementContentHandlers {
  return {
    element(element) {
      element.setAttribute(attribute, value);
    },
  };
}

export function rewriteDogPageMetadata(
  response: Response,
  metadata: DogPageMetadata,
): Response {
  const rewriter = new HTMLRewriter()
    .on("title", {
      element(element) {
        element.setInnerContent(metadata.title);
      },
    })
    .on("meta[name=\"description\"]", attributeHandler("content", metadata.description))
    .on("meta[name=\"robots\"]", attributeHandler("content", metadata.robots))
    .on("meta[name=\"googlebot\"]", attributeHandler("content", metadata.robots))
    .on("link[rel=\"canonical\"]", attributeHandler("href", metadata.canonicalUrl))
    .on("meta[property=\"og:title\"]", attributeHandler("content", metadata.title))
    .on(
      "meta[property=\"og:description\"]",
      attributeHandler("content", metadata.description),
    )
    .on("meta[property=\"og:image\"]", attributeHandler("content", metadata.imageUrl))
    .on(
      "meta[property=\"og:image:secure_url\"]",
      attributeHandler("content", metadata.imageUrl),
    )
    .on("meta[property=\"og:image:type\"]", attributeHandler("content", "image/jpeg"))
    .on(
      "meta[property=\"og:image:width\"]",
      attributeHandler("content", String(metadata.imageWidth)),
    )
    .on(
      "meta[property=\"og:image:height\"]",
      attributeHandler("content", String(metadata.imageHeight)),
    )
    .on("meta[property=\"og:image:alt\"]", attributeHandler("content", metadata.imageAlt))
    .on("meta[property=\"og:url\"]", attributeHandler("content", metadata.canonicalUrl))
    .on("meta[property=\"og:type\"]", attributeHandler("content", "website"))
    .on("meta[name=\"twitter:card\"]", attributeHandler("content", "summary_large_image"))
    .on("meta[name=\"twitter:title\"]", attributeHandler("content", metadata.title))
    .on(
      "meta[name=\"twitter:description\"]",
      attributeHandler("content", metadata.description),
    )
    .on("meta[name=\"twitter:image\"]", attributeHandler("content", metadata.imageUrl))
    .on("meta[name=\"twitter:image:alt\"]", attributeHandler("content", metadata.imageAlt));

  return rewriter.transform(response);
}
