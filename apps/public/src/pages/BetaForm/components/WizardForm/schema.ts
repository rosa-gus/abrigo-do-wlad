import { z } from "zod";

const ALLOWED_SOCIAL_DOMAINS = [
  "instagram.com",
  "tiktok.com",
  "youtube.com",
  "facebook.com",
  "linkedin.com",
  "twitter.com",
  "x.com",
  "t.me", // telegram
  "wa.me", // whatsapp
  "whatsapp.com",
  "pinterest.com",
  "reddit.com",
  "medium.com",
  "blogspot.com",
  "behance.net",
  "flickr.com",
];

export const step1Schema = z.object({
  nome_adotante: z
    .string({
      error: (issue) =>
        issue.input === undefined ? "Informe o nome." : "Nome inválido.",
    })
    .min(3, { message: "Nome deve ter pelo menos 3 caracteres." }),
  idade: z.coerce
    .number({
      error: (issue) =>
        issue.input === undefined ? "Informe a sua idade." : "Idade inválida.",
    })
    .min(18, "Deve ter pelo menos 18 anos"),
  estado_civil: z
    .string({
      error: (issue) =>
        issue.input === undefined
          ? "Selecione o estado civil."
          : "Estado civil inválido.",
    })
    .min(1, "Selecione o estado civil"),
  profissao: z
    .string({
      error: (issue) =>
        issue.input === undefined
          ? "Informe sua profissão."
          : "Profissão inválida.",
    })
    .min(2, "Informe sua profissão"),
  empresa: z
    .string({
      error: (issue) =>
        issue.input === undefined ? "Informe a empresa." : "Empresa inválida.",
    })
    .min(2, "Informe a empresa"),
  endereco: z
    .string({
      error: (issue) =>
        issue.input === undefined
          ? "Informe o endereço completo."
          : "Endereço inválido.",
    })
    .min(5, "Informe o endereço completo"),
  telefone: z
    .string({
      error: (issue) =>
        issue.input === undefined
          ? "Informe o telefone."
          : "Telefone inválido.",
    })
    .min(14, "Telefone inválido"),
  email: z
    .string({
      error: (issue) =>
        issue.input === undefined ? "Informe o e-mail." : "E-mail inválido.",
    })
    .email("E-mail inválido"),
  redes_sociais: z
    .string({
      error: (issue) =>
        issue.input === undefined
          ? "Informe ao menos uma rede social."
          : "Rede social inválida.",
    })
    .min(2, "Informe ao menos uma rede social")
    .refine(
      (val) => {
        const items = val
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        if (items.length === 0) return false;

        const handleRegex = /^@?[A-Za-z0-9._-]{1,30}$/;

        const normalize = (str: string) => {
          // remove surrounding angle brackets and common trailing punctuation
          let t = str.replace(/^<|>$/g, "").trim();
          t = t.replace(/[.,;:)]*$/g, "");
          return t;
        };

        return items.every((raw) => {
          const s = normalize(raw);

          // accept simple handles like @usuario or usuario
          if (handleRegex.test(s)) return true;

          try {
            const input = s.startsWith("//")
              ? `https:${s}`
              : s.includes("://")
                ? s
                : `https://${s}`;
            const url = new URL(input);
            const host = url.hostname.toLowerCase().replace(/^www\./, "");

            // whitelist match
            if (
              ALLOWED_SOCIAL_DOMAINS.some(
                (d) => host === d || host.endsWith(`.${d}`),
              )
            ) {
              return true;
            }

            // permissive fallback: accept any valid URL with a hostname that
            // looks like a domain (contains a dot). This avoids blocking
            // valid personal pages or uncommon domains while keeping a
            // whitelist as preferred.
            if (host.includes(".")) return true;

            return false;
          } catch {
            return false;
          }
        });
      },
      {
        message:
          "Insira URLs válidas de redes sociais (ex.: instagram.com, tiktok.com). Separe múltiplas por vírgula.",
      },
    ),
});

export const step2Schema = z.object({
  qtd_adultos: z.coerce
    .number({
      error: (issue) =>
        issue.input === undefined
          ? "Informe a quantidade de adultos."
          : "Quantidade inválida.",
    })
    .min(1, "Informe a quantidade de adultos"),
  criancas: z
    .string({
      error: (issue) =>
        issue.input === undefined
          ? "Informe sobre crianças na casa."
          : "Valor inválido.",
    })
    .min(1, "Informe sobre crianças na casa"),
  renda_mensal: z
    .string({
      error: (issue) =>
        issue.input === undefined
          ? "Informe a renda mensal."
          : "Valor inválido.",
    })
    .min(1, "Informe a renda mensal"),
  acordo: z
    .string({
      error: (issue) =>
        issue.input === undefined ? "Selecione uma opção." : "Opção inválida.",
    })
    .min(1, "Selecione uma opção"),
  alergia: z
    .string({
      error: (issue) =>
        issue.input === undefined
          ? "Responda sobre alergias."
          : "Valor inválido.",
    })
    .min(1, "Responda sobre alergias"),
});

export const step3Schema = z.object({
  motivo: z
    .string({
      error: (issue) =>
        issue.input === undefined ? "Descreva o motivo." : "Valor inválido.",
    })
    .min(5, "Descreva o motivo"),
  animal_especifico: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z
      .string({
        error: (issue) =>
          issue.input === undefined ? "Informe o animal." : "Valor inválido.",
      })
      .min(1, "Informe o animal")
      .optional(),
  ),
  porte: z
    .string({
      error: (issue) =>
        issue.input === undefined ? "Selecione o porte." : "Opção inválida.",
    })
    .min(1, "Selecione o porte"),
  sexo: z.string().default("Não importa"),
  idade_animal: z
    .string({
      error: (issue) =>
        issue.input === undefined ? "Selecione a idade." : "Opção inválida.",
    })
    .min(1, "Selecione a idade"),
  personalidade: z
    .string({
      error: (issue) =>
        issue.input === undefined
          ? "Selecione a personalidade."
          : "Opção inválida.",
    })
    .min(1, "Selecione a personalidade"),
  atividade: z
    .string({
      error: (issue) =>
        issue.input === undefined
          ? "Selecione a atividade."
          : "Opção inválida.",
    })
    .min(1, "Selecione a atividade"),
});

export const step4Schema = z.object({
  responsavel: z
    .string({
      error: (issue) =>
        issue.input === undefined
          ? "Informe o responsável."
          : "Valor inválido.",
    })
    .min(2, "Informe o responsável"),
  horas_sozinho: z
    .string({
      error: (issue) =>
        issue.input === undefined ? "Informe as horas." : "Valor inválido.",
    })
    .min(1, "Informe as horas"),
  passeios: z
    .string({
      error: (issue) =>
        issue.input === undefined
          ? "Informe sobre passeios."
          : "Valor inválido.",
    })
    .min(1, "Informe sobre passeios"),
  tipo_moradia: z
    .string({
      error: (issue) =>
        issue.input === undefined
          ? "Selecione o tipo de moradia."
          : "Opção inválida.",
    })
    .min(1, "Selecione o tipo de moradia"),
  proprietario_permite: z.string().default("Nao aplica"),
  detalhes_moradia: z
    .string({
      error: (issue) =>
        issue.input === undefined
          ? "Selecione os detalhes."
          : "Opção inválida.",
    })
    .min(1, "Selecione os detalhes"),
  moradores: z
    .string({
      error: (issue) =>
        issue.input === undefined ? "Informe os moradores." : "Valor inválido.",
    })
    .min(1, "Informe os moradores"),
  areas_frequentar: z
    .string({
      error: (issue) =>
        issue.input === undefined ? "Informe as áreas." : "Valor inválido.",
    })
    .min(1, "Informe as áreas"),
  periodos: z
    .string({
      error: (issue) =>
        issue.input === undefined ? "Informe os períodos." : "Valor inválido.",
    })
    .min(1, "Informe os períodos"),
  dormir: z
    .string({
      error: (issue) =>
        issue.input === undefined
          ? "Informe onde o animal dormirá."
          : "Valor inválido.",
    })
    .min(1, "Informe onde o animal dormirá"),
  acesso: z
    .string({
      error: (issue) =>
        issue.input === undefined ? "Selecione o acesso." : "Opção inválida.",
    })
    .min(1, "Selecione o acesso"),
});

export const step5Schema = z.object({
  outros_animais: z
    .string({
      error: (issue) =>
        issue.input === undefined
          ? "Responda sobre outros animais."
          : "Valor inválido.",
    })
    .min(1, "Responda sobre outros animais"),
  castrados: z
    .string({
      error: (issue) =>
        issue.input === undefined
          ? "Responda sobre castração."
          : "Valor inválido.",
    })
    .min(1, "Responda sobre castração"),
  ja_teve: z
    .string({
      error: (issue) =>
        issue.input === undefined
          ? "Responda sobre animais anteriores."
          : "Valor inválido.",
    })
    .min(1, "Responda sobre animais anteriores"),
  destino_antigos: z
    .string({
      error: (issue) =>
        issue.input === undefined
          ? "Responda sobre os animais anteriores."
          : "Valor inválido.",
    })
    .min(1, "Responda sobre os animais anteriores"),
  veterinario: z
    .string({
      error: (issue) =>
        issue.input === undefined
          ? "Informe o veterinário."
          : "Valor inválido.",
    })
    .min(1, "Informe o veterinário"),
  racao: z
    .string({
      error: (issue) =>
        issue.input === undefined ? "Informe a ração." : "Valor inválido.",
    })
    .min(1, "Informe a ração"),
});

export const step6Schema = z.object({
  coleira: z
    .string({
      error: (issue) =>
        issue.input === undefined ? "Selecione uma opção." : "Opção inválida.",
    })
    .min(1, "Selecione uma opção"),
  ciencia_adaptacao: z
    .string({
      error: (issue) =>
        issue.input === undefined ? "Selecione uma opção." : "Opção inválida.",
    })
    .min(1, "Selecione uma opção"),
  tempo_adaptacao: z
    .string({
      error: (issue) =>
        issue.input === undefined ? "Informe o tempo." : "Valor inválido.",
    })
    .min(1, "Informe o tempo"),
  adestrador: z
    .string({
      error: (issue) =>
        issue.input === undefined ? "Selecione uma opção." : "Opção inválida.",
    })
    .min(1, "Selecione uma opção"),
  motivo_nao_adestrar: z.string().optional(),
  carro: z
    .string({
      error: (issue) =>
        issue.input === undefined ? "Selecione uma opção." : "Opção inválida.",
    })
    .min(1, "Selecione uma opção"),
  financeiro_vet: z
    .string({
      error: (issue) =>
        issue.input === undefined ? "Selecione uma opção." : "Opção inválida.",
    })
    .min(1, "Selecione uma opção"),
  vacinas: z
    .string({
      error: (issue) =>
        issue.input === undefined ? "Selecione uma opção." : "Opção inválida.",
    })
    .min(1, "Selecione uma opção"),
  gasto_mensal: z
    .string({
      error: (issue) =>
        issue.input === undefined ? "Selecione uma opção." : "Opção inválida.",
    })
    .min(1, "Selecione uma opção"),
});

export const step7Schema = z.object({
  divulgacao: z
    .string({
      error: (issue) =>
        issue.input === undefined ? "Informe onde viu." : "Valor inválido.",
    })
    .min(1, "Informe onde viu"),
  noticias: z
    .string({
      error: (issue) =>
        issue.input === undefined ? "Selecione uma opção." : "Opção inválida.",
    })
    .min(1, "Selecione uma opção"),
  visitas: z
    .string({
      error: (issue) =>
        issue.input === undefined ? "Selecione uma opção." : "Opção inválida.",
    })
    .min(1, "Selecione uma opção"),
  fotos_adocao: z
    .string({
      error: (issue) =>
        issue.input === undefined ? "Selecione uma opção." : "Opção inválida.",
    })
    .min(1, "Selecione uma opção"),
  contribuicao: z
    .string({
      error: (issue) =>
        issue.input === undefined ? "Selecione uma opção." : "Opção inválida.",
    })
    .min(1, "Selecione uma opção"),
  compromisso_vida: z
    .string({
      error: (issue) =>
        issue.input === undefined ? "Selecione uma opção." : "Opção inválida.",
    })
    .min(1, "Selecione uma opção"),
});

export const step8Schema = z.object({
  gravidez: z
    .string({
      error: (issue) =>
        issue.input === undefined
          ? "Responda com detalhes."
          : "Valor inválido.",
    })
    .min(3, "Responda com detalhes"),
  viagem: z
    .string({
      error: (issue) =>
        issue.input === undefined
          ? "Responda com detalhes."
          : "Valor inválido.",
    })
    .min(3, "Responda com detalhes"),
  mudanca_menor: z
    .string({
      error: (issue) =>
        issue.input === undefined
          ? "Responda com detalhes."
          : "Valor inválido.",
    })
    .min(3, "Responda com detalhes"),
  mudanca_longe: z
    .string({
      error: (issue) =>
        issue.input === undefined
          ? "Responda com detalhes."
          : "Valor inválido.",
    })
    .min(3, "Responda com detalhes"),
  separacao: z
    .string({
      error: (issue) =>
        issue.input === undefined
          ? "Responda com detalhes."
          : "Valor inválido.",
    })
    .min(3, "Responda com detalhes"),
  falecimento: z
    .string({
      error: (issue) =>
        issue.input === undefined
          ? "Responda com detalhes."
          : "Valor inválido.",
    })
    .min(3, "Responda com detalhes"),
});

export const step9Schema = z.object({
  perder: z
    .string({
      error: (issue) =>
        issue.input === undefined ? "Responda a questão." : "Valor inválido.",
    })
    .min(3, "Responda a questão"),
  doenca: z
    .string({
      error: (issue) =>
        issue.input === undefined ? "Responda a questão." : "Valor inválido.",
    })
    .min(3, "Responda a questão"),
  morder: z
    .string({
      error: (issue) =>
        issue.input === undefined ? "Responda a questão." : "Valor inválido.",
    })
    .min(3, "Responda a questão"),
  destruicao: z
    .string({
      error: (issue) =>
        issue.input === undefined ? "Responda a questão." : "Valor inválido.",
    })
    .min(3, "Responda a questão"),
  xixi_errado: z
    .string({
      error: (issue) =>
        issue.input === undefined ? "Responda a questão." : "Valor inválido.",
    })
    .min(3, "Responda a questão"),
});

export const step10Schema = z.object({
  enxoval: z
    .string({
      error: (issue) =>
        issue.input === undefined ? "Responda a questão." : "Valor inválido.",
    })
    .min(3, "Responda a questão"),
  devolucao: z
    .string({
      error: (issue) =>
        issue.input === undefined ? "Responda a questão." : "Valor inválido.",
    })
    .min(3, "Responda a questão"),
  termo_nao_repassar: z
    .string({
      error: (issue) =>
        issue.input === undefined ? "Selecione uma opção." : "Opção inválida.",
    })
    .min(1, "Selecione uma opção"),
  obs: z.string().optional(),
});

export const stepSchemas = [
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
] as const;

export const fullFormSchema = z.object({
  ...step1Schema.shape,
  ...step2Schema.shape,
  ...step3Schema.shape,
  ...step4Schema.shape,
  ...step5Schema.shape,
  ...step6Schema.shape,
  ...step7Schema.shape,
  ...step8Schema.shape,
  ...step9Schema.shape,
  ...step10Schema.shape,
  captchaToken: z.string(),
});

export type FormData = z.infer<typeof fullFormSchema>;

export type Step1Data = z.infer<typeof step1Schema>;
export type Step2Data = z.infer<typeof step2Schema>;
export type Step3Data = z.infer<typeof step3Schema>;
export type Step4Data = z.infer<typeof step4Schema>;
export type Step5Data = z.infer<typeof step5Schema>;
export type Step6Data = z.infer<typeof step6Schema>;
export type Step7Data = z.infer<typeof step7Schema>;
export type Step8Data = z.infer<typeof step8Schema>;
export type Step9Data = z.infer<typeof step9Schema>;
export type Step10Data = z.infer<typeof step10Schema>;
