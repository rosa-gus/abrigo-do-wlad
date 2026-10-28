import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { step1Schema, step2Schema, stepSchemas } from "../../../../public/src/pages/BetaForm/components/WizardForm/schema";
import { ADOPTION_REVIEW_STEPS, AdoptionDetailsSection } from ".";

describe("adoption application review metadata", () => {
  test("covers every field from the public adoption form exactly once", () => {
    const formFields = stepSchemas.flatMap((schema) => Object.keys(schema.shape));
    const reviewFields = ADOPTION_REVIEW_STEPS.flatMap((step) =>
      step.fields.map((field) => field.key),
    );

    expect(new Set(reviewFields).size).toBe(reviewFields.length);
    expect(new Set(reviewFields)).toEqual(new Set(formFields));
    expect(ADOPTION_REVIEW_STEPS).toHaveLength(stepSchemas.length);
  });

  test("renders each question and answer as semantic definition data", () => {
    const step = ADOPTION_REVIEW_STEPS[0];
    const html = renderToStaticMarkup(createElement(AdoptionDetailsSection, {
      application: {
        id: "application-test",
        nome_adotante: "Lívia Martins",
      },
      step,
    }));

    expect(html).toContain("<dl");
    expect(html.match(/<dt/g)).toHaveLength(step.fields.length);
    expect(html.match(/<dd/g)).toHaveLength(step.fields.length);
    expect(html).toContain(">1.1.</span>");
    expect(html).toContain(">Nome do adotante</span>");
    expect(html).toContain(">Lívia Martins</dd>");
    expect(html).toContain(">Não informado</dd>");
  });

  test("renders numeric answers produced by the public form", () => {
    const application = {
      id: "application-numeric",
      idade: step1Schema.shape.idade.parse("28"),
      qtd_adultos: step2Schema.shape.qtd_adultos.parse("2"),
    };

    const html = ADOPTION_REVIEW_STEPS.slice(0, 2).map((step) =>
      renderToStaticMarkup(createElement(AdoptionDetailsSection, { application, step })),
    ).join("");

    expect(html).toContain(">28</dd>");
    expect(html).toContain(">2</dd>");
  });

  test.each([
    [0, "0"],
    ["28", "28"],
    ["   ", "Não informado"],
    [undefined, "Não informado"],
  ])("renders age %j without treating zero as missing", (idade, expected) => {
    const html = renderToStaticMarkup(createElement(AdoptionDetailsSection, {
      application: { id: "application-age", idade },
      step: { ...ADOPTION_REVIEW_STEPS[0], fields: [{ key: "idade", label: "Idade" }] },
    }));

    expect(html).toContain(`>${expected}</dd>`);
  });
});
