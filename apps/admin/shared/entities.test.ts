import { describe, expect, test } from "vitest";

import {
  MAX_DOG_TEMPERAMENT_LENGTH,
  dogEntitySchema,
  dogInputSchema,
  dogUpdateSchema,
  formatDogAge,
  parseDogAge,
  recyclePointEntitySchema,
  recyclePointInputSchema,
  recyclePointUpdateSchema,
} from "./entities";

const validDogInput = {
  nome: "Nina",
  idade: "2 anos",
  cateIdade: "adulto" as const,
  sexo: "Fêmea" as const,
  temperamento: "Dócil e sociável",
  tags: ["docil"],
  status: "Vacinado e Castrado" as const,
  fotos: [],
  cor: "caramelo",
  instaLink: "",
  descricaoCompleta: "",
};

const validRecyclePointInput = {
  zone: "ZONA SUL",
  neighborhood: "Morumbi",
  name: "Mercado local",
  address: "Rua Exemplo, 123",
  googleMapsUrl: "https://maps.app.goo.gl/abc123",
};

describe("admin entity contracts", () => {
  test.each(["1 ano", "2 anos", "1 mês", "8 meses", "2-3 anos"])(
    "accepts the canonical dog age %s",
    (idade) => {
      expect(dogInputSchema.safeParse({ ...validDogInput, idade }).success).toBe(true);
    },
  );

  test.each(["aaaaaaaa", "2--3 anos", "3-2 anos", "1 anos", "31 anos"])(
    "rejects the invalid dog age %s",
    (idade) => {
      expect(dogInputSchema.safeParse({ ...validDogInput, idade }).success).toBe(false);
    },
  );

  test("parses and formats dog ages without changing the stored string contract", () => {
    expect(parseDogAge("2-3 anos")).toEqual({ range: "2-3", unit: "anos" });
    expect(formatDogAge("1", "meses")).toBe("1 mês");
    expect(formatDogAge("1-1", "anos")).toBe("1 ano");
  });

  test("normalizes legacy dog tag labels to their contract values", () => {
    const result = dogEntitySchema.parse({
      ...validDogInput,
      id: 123,
      tags: ["Dócil", "Sociável"],
    });

    expect(result.tags).toEqual(["docil", "sociavel"]);
  });

  test("keeps reads tolerant to legacy free-form dog ages", () => {
    const result = dogEntitySchema.safeParse({
      ...validDogInput,
      id: 123,
      idade: "aproximadamente dois anos",
    });

    expect(result.success).toBe(true);
  });

  test("accepts a dog temperament at the write limit", () => {
    const result = dogInputSchema.safeParse({
      ...validDogInput,
      temperamento: "a".repeat(MAX_DOG_TEMPERAMENT_LENGTH),
    });

    expect(result.success).toBe(true);
  });

  test("rejects a dog temperament above the write limit", () => {
    const result = dogInputSchema.safeParse({
      ...validDogInput,
      temperamento: "a".repeat(MAX_DOG_TEMPERAMENT_LENGTH + 1),
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain("no máximo 80 caracteres");
    }
  });

  test("keeps reads tolerant to legacy dog temperaments", () => {
    const result = dogEntitySchema.safeParse({
      ...validDogInput,
      id: 123,
      temperamento: "a".repeat(MAX_DOG_TEMPERAMENT_LENGTH + 1),
    });

    expect(result.success).toBe(true);
  });

  test("rejects empty dog updates", () => {
    expect(dogUpdateSchema.safeParse({}).success).toBe(false);
  });

  test.each([
    "https://maps.app.goo.gl/abc123",
    "https://www.google.com/maps/place/Morumbi",
    "https://www.google.com.br/maps/place/Morumbi",
    "https://maps.google.com/?q=Morumbi",
    "https://goo.gl/maps/abc123",
  ])("accepts the Google Maps URL %s", (googleMapsUrl) => {
    expect(recyclePointInputSchema.safeParse({
      ...validRecyclePointInput,
      googleMapsUrl,
    }).success).toBe(true);
  });

  test.each([
    "http://www.google.com/maps/place/Morumbi",
    "https://www.google.com/search?q=Morumbi",
    "https://maps.app.goo.gl.example.com/abc123",
    "https://example.com/maps/place/Morumbi",
  ])("rejects the non-Google Maps URL %s", (googleMapsUrl) => {
    expect(recyclePointInputSchema.safeParse({
      ...validRecyclePointInput,
      googleMapsUrl,
    }).success).toBe(false);
  });

  test("allows a point without a Google Maps URL", () => {
    expect(recyclePointInputSchema.safeParse({
      ...validRecyclePointInput,
      googleMapsUrl: "",
    }).success).toBe(true);
  });

  test("allows a partial update to change the Google Maps URL", () => {
    expect(recyclePointUpdateSchema.safeParse({
      googleMapsUrl: "https://maps.app.goo.gl/new-link",
    }).success).toBe(true);
  });

  test("parses a stored point with a Google Maps URL", () => {
    expect(recyclePointEntitySchema.safeParse({
      ...validRecyclePointInput,
      id: "point-1",
    }).success).toBe(true);
  });
});


describe("publication contracts", () => {
  test("drafts round-trip without inventing missing dog details", () => {
    const draft = dogInputSchema.parse({ nome: "Nina" });
    expect(draft.publicationStatus).toBe("draft");
    expect(draft.status).toBe("");
    expect(draft.sexo).toBe("");
    expect(draft.cateIdade).toBe("");
    expect(dogEntitySchema.array().parse([{ ...draft, id: 1 }])[0]).toEqual({ ...draft, id: 1 });
    expect(dogInputSchema.safeParse({ ...draft, publicationStatus: "published" }).success).toBe(false);
    expect(dogInputSchema.safeParse({ ...validDogInput, publicationStatus: "published" }).success).toBe(true);
  });
  test("recycle drafts require an identifier and can omit the address", () => {
    const draft = recyclePointInputSchema.parse({ name: "Mercado" });
    expect(draft.address).toBe("");
    expect(recyclePointEntitySchema.parse({ ...draft, id: "p" }).publicationStatus).toBe("draft");
    expect(recyclePointInputSchema.safeParse({}).success).toBe(false);
    expect(recyclePointInputSchema.safeParse({ ...draft, publicationStatus: "published" }).success).toBe(false);
  });
  test("updates do not fill absent fields or accept an invalid publication status", () => {
    expect(dogUpdateSchema.parse({ publicationStatus: "published" })).toEqual({ publicationStatus: "published" });
    expect(recyclePointUpdateSchema.parse({ publicationStatus: "draft" })).toEqual({ publicationStatus: "draft" });
    expect(dogUpdateSchema.safeParse({ publicationStatus: "unknown" }).success).toBe(false);
    expect(dogInputSchema.safeParse({ nome: "Nina", fotos: ["javascript:alert(1)"] }).success).toBe(false);
  });
});
