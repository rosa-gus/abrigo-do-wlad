import { describe, expect, it } from "vitest";

import {
  VALID_ADOPTION_APPLICATION,
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
  buildValidAdoptionApplication,
} from "../../../../test/fixtures/adoption";
import {
  fullFormSchema,
  step1Schema,
  step2Schema,
  step3Schema,
  step4Schema,
  step5Schema,
  step6Schema,
  step7Schema,
  step8Schema,
  step9Schema,
  step10Schema,
  stepSchemas,
} from "./schema";

interface StepCase {
  name: string;
  schema: (typeof stepSchemas)[number];
  valid: Record<string, unknown>;
  optionalOrDefault: string[];
}

const STEP_CASES: StepCase[] = [
  {
    name: "etapa 1",
    schema: step1Schema,
    valid: VALID_STEP_1,
    optionalOrDefault: [],
  },
  {
    name: "etapa 2",
    schema: step2Schema,
    valid: VALID_STEP_2,
    optionalOrDefault: [],
  },
  {
    name: "etapa 3",
    schema: step3Schema,
    valid: VALID_STEP_3,
    optionalOrDefault: ["animal_especifico", "sexo"],
  },
  {
    name: "etapa 4",
    schema: step4Schema,
    valid: VALID_STEP_4,
    optionalOrDefault: ["proprietario_permite"],
  },
  {
    name: "etapa 5",
    schema: step5Schema,
    valid: VALID_STEP_5,
    optionalOrDefault: [],
  },
  {
    name: "etapa 6",
    schema: step6Schema,
    valid: VALID_STEP_6,
    optionalOrDefault: ["motivo_nao_adestrar"],
  },
  {
    name: "etapa 7",
    schema: step7Schema,
    valid: VALID_STEP_7,
    optionalOrDefault: [],
  },
  {
    name: "etapa 8",
    schema: step8Schema,
    valid: VALID_STEP_8,
    optionalOrDefault: [],
  },
  {
    name: "etapa 9",
    schema: step9Schema,
    valid: VALID_STEP_9,
    optionalOrDefault: [],
  },
  {
    name: "etapa 10",
    schema: step10Schema,
    valid: VALID_STEP_10,
    optionalOrDefault: ["obs"],
  },
];

function withoutField(
  input: Record<string, unknown>,
  field: string,
): Record<string, unknown> {
  const result = { ...input };
  delete result[field];
  return result;
}

describe.each(STEP_CASES)("$name", ({ schema, valid, optionalOrDefault }) => {
  it("aceita uma resposta sintética válida", () => {
    expect(schema.safeParse(valid).success).toBe(true);
  });

  const requiredFields = Object.keys(valid).filter(
    (field) => !optionalOrDefault.includes(field),
  );

  it.each(requiredFields)("rejeita a ausência do campo obrigatório %s", (field) => {
    const input = { ...valid };
    delete input[field];

    const result = schema.safeParse(input);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === field)).toBe(
        true,
      );
    }
  });

  it.each(requiredFields)("rejeita o tipo inválido no campo %s", (field) => {
    const result = schema.safeParse({
      ...valid,
      [field]: { valor: "tipo deliberadamente inválido" },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === field)).toBe(
        true,
      );
    }
  });

  it.each(optionalOrDefault)(
    "rejeita o tipo inválido no campo opcional ou default %s",
    (field) => {
      expect(
        schema.safeParse({
          ...valid,
          [field]: { valor: "tipo deliberadamente inválido" },
        }).success,
      ).toBe(false);
    },
  );
});

describe("fronteiras dos schemas", () => {
  it.each([
    { nome_adotante: "   " }, { telefone: "abcdefghijklmno" },
    { idade: 18.5 }, { estado_civil: "opção inventada" },
  ])("rejeita respostas incompatíveis com o campo: %j", (override) => {
    expect(step1Schema.safeParse({ ...VALID_STEP_1, ...override }).success).toBe(false);
  });
  it("normaliza espaços antes de validar o conteúdo", () => {
    expect(step1Schema.parse({ ...VALID_STEP_1, nome_adotante: "  Nome Completo  " }).nome_adotante).toBe("Nome Completo");
  });
  it("rejeita uma quantidade fracionária de adultos e alternativas forjadas", () => {
    expect(step2Schema.safeParse({ ...VALID_STEP_2, qtd_adultos: 1.5 }).success).toBe(false);
    expect(step2Schema.safeParse({ ...VALID_STEP_2, qtd_adultos: true }).success).toBe(false);
    expect(step1Schema.safeParse({ ...VALID_STEP_1, redes_sociais: "javascript://example.com" }).success).toBe(false);
    expect(step6Schema.safeParse({ ...VALID_STEP_6, vacinas: "qualquer coisa" }).success).toBe(false);
  });

  it("aceita idade mínima e converte uma idade textual", () => {
    const result = step1Schema.parse({ ...VALID_STEP_1, idade: "18" });

    expect(result.idade).toBe(18);
  });

  it("rejeita candidato menor de idade", () => {
    const result = step1Schema.safeParse({ ...VALID_STEP_1, idade: 17 });

    expect(result.success).toBe(false);
  });

  it.each([
    ["nome com menos de três caracteres", { nome_adotante: "AB" }],
    ["telefone com menos de 14 caracteres", { telefone: "1234567890123" }],
    ["e-mail inválido", { email: "email-invalido" }],
    ["rede social inválida", { redes_sociais: "perfil com espaços!" }],
    [
      "rede social sem domínio público",
      { redes_sociais: "https://localhost/perfil" },
    ],
  ])("rejeita %s", (_description, override) => {
    expect(step1Schema.safeParse({ ...VALID_STEP_1, ...override }).success).toBe(
      false,
    );
  });

  it.each([
    "@perfil_teste",
    "https://instagram.com/perfil.teste",
    "instagram.com/perfil, @outro_perfil",
    "https://portfolio.example/perfil",
  ])("aceita o formato de rede social %s", (redesSociais) => {
    expect(
      step1Schema.safeParse({
        ...VALID_STEP_1,
        redes_sociais: redesSociais,
      }).success,
    ).toBe(true);
  });

  it("converte a quantidade textual de adultos", () => {
    const result = step2Schema.parse({ ...VALID_STEP_2, qtd_adultos: "2" });

    expect(result.qtd_adultos).toBe(2);
  });

  it("rejeita residência sem uma pessoa adulta", () => {
    expect(
      step2Schema.safeParse({ ...VALID_STEP_2, qtd_adultos: 0 }).success,
    ).toBe(false);
  });

  it("normaliza animal específico vazio para campo ausente", () => {
    const result = step3Schema.parse({
      ...VALID_STEP_3,
      animal_especifico: "",
    });

    expect(result.animal_especifico).toBeUndefined();
  });

  it("aplica os valores default das etapas 3 e 4", () => {
    const step3Input = withoutField(VALID_STEP_3, "sexo");
    const step4Input = withoutField(VALID_STEP_4, "proprietario_permite");

    expect(step3Schema.parse(step3Input).sexo).toBe("Não importa");
    expect(step4Schema.parse(step4Input).proprietario_permite).toBe(
      "Nao aplica",
    );
  });

  it.each([
    [step3Schema, VALID_STEP_3, "motivo"],
    [step8Schema, VALID_STEP_8, "gravidez"],
    [step9Schema, VALID_STEP_9, "perder"],
    [step10Schema, VALID_STEP_10, "enxoval"],
  ])("rejeita texto abaixo do mínimo esperado", (schema, valid, field) => {
    expect(schema.safeParse({ ...valid, [field]: "ab" }).success).toBe(false);
  });

  it("aceita os campos opcionais ausentes", () => {
    const step3Input = withoutField(VALID_STEP_3, "animal_especifico");
    const step6Input = withoutField(VALID_STEP_6, "motivo_nao_adestrar");
    const step10Input = withoutField(VALID_STEP_10, "obs");

    expect(step3Schema.safeParse(step3Input).success).toBe(true);
    expect(step6Schema.safeParse(step6Input).success).toBe(true);
    expect(step10Schema.safeParse(step10Input).success).toBe(true);
  });
});

describe("formulário completo", () => {
  it("mantém os dez schemas na ordem esperada", () => {
    expect(stepSchemas).toEqual([
      step1Schema,
      step2Schema,
      step3Schema,
      step4Schema,
      step5Schema,
      step6Schema,
      step7Schema,
      step8Schema,
      step9Schema,
      step10Schema,
    ]);
  });

  it("aceita a candidatura sintética completa", () => {
    expect(fullFormSchema.safeParse(VALID_ADOPTION_APPLICATION).success).toBe(
      true,
    );
  });

  it("mantém a fixture alinhada aos campos do contrato completo", () => {
    expect(Object.keys(VALID_ADOPTION_APPLICATION).sort()).toEqual(
      Object.keys(fullFormSchema.shape).sort(),
    );
  });

  it("cria uma nova candidatura sem alterar a fixture base", () => {
    const application = buildValidAdoptionApplication({ idade: 41 });

    expect(application.idade).toBe(41);
    expect(VALID_ADOPTION_APPLICATION.idade).toBe(30);
  });

  it("rejeita um campo obrigatório ausente", () => {
    const application: Record<string, unknown> = {
      ...VALID_ADOPTION_APPLICATION,
    };
    delete application.nome_adotante;

    const result = fullFormSchema.safeParse(application);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["nome_adotante"]);
    }
  });

  it("rejeita o captcha ausente", () => {
    const application: Record<string, unknown> = {
      ...VALID_ADOPTION_APPLICATION,
    };
    delete application.captchaToken;

    expect(fullFormSchema.safeParse(application).success).toBe(false);
  });

  it("rejeita captcha com tipo inválido", () => {
    expect(
      fullFormSchema.safeParse({
        ...VALID_ADOPTION_APPLICATION,
        captchaToken: 123,
      }).success,
    ).toBe(false);
  });

  it("remove propriedades desconhecidas do resultado validado", () => {
    const result = fullFormSchema.parse({
      ...VALID_ADOPTION_APPLICATION,
      propriedade_inesperada: "não deve atravessar o contrato",
    });

    expect(result).not.toHaveProperty("propriedade_inesperada");
  });
});
