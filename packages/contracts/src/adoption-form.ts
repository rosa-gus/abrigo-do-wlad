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

const numericInput = (value: unknown) =>
  typeof value === "string" && value.trim() !== "" ? Number(value) : value;

export const step1Schema = z.object({
  nome_adotante: z
    .string({
      error: (issue) =>
        issue.input === undefined ? "Informe o nome." : "Nome inválido.",
    })
    .trim()
    .min(3, { message: "Nome deve ter pelo menos 3 caracteres." }),
  idade: z.preprocess(numericInput,
    z.number({
      error: (issue) =>
        issue.input === undefined ? "Informe a sua idade." : "Idade inválida.",
    })
    .int("Informe um número inteiro.")
    .min(18, "Deve ter pelo menos 18 anos")
  ),
  estado_civil: z
    .string({
      error: (issue) =>
        issue.input === undefined
          ? "Selecione o estado civil."
          : "Estado civil inválido.",
    })
    .trim()
    .min(1, "Selecione o estado civil")
    .refine((value) => ["Solteiro", "Casado/Uniao", "Separado", "Viuvo"].includes(value), "Selecione uma opção válida."),
  profissao: z
    .string({
      error: (issue) =>
        issue.input === undefined
          ? "Informe sua profissão."
          : "Profissão inválida.",
    })
    .trim()
    .min(2, "Informe sua profissão"),
  empresa: z
    .string({
      error: (issue) =>
        issue.input === undefined ? "Informe a empresa." : "Empresa inválida.",
    })
    .trim()
    .min(2, "Informe a empresa"),
  endereco: z
    .string({
      error: (issue) =>
        issue.input === undefined
          ? "Informe o endereço completo."
          : "Endereço inválido.",
    })
    .trim()
    .min(5, "Informe o endereço completo"),
  telefone: z
    .string({
      error: (issue) =>
        issue.input === undefined
          ? "Informe o telefone."
          : "Telefone inválido.",
    })
    .trim()
    .regex(/^(?:\([1-9]\d\)|[1-9]\d)\s?\d{4,5}-?\d{4}$/, "Informe um telefone válido com DDD."),
  email: z
    .string({
      error: (issue) =>
        issue.input === undefined ? "Informe o e-mail." : "E-mail inválido.",
    })
    .trim()
    .email("E-mail inválido"),
  redes_sociais: z
    .string({
      error: (issue) =>
        issue.input === undefined
          ? "Informe ao menos uma rede social."
          : "Rede social inválida.",
    })
    .trim()
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
            if (!["http:", "https:"].includes(url.protocol)) return false;
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
  qtd_adultos: z.preprocess(numericInput,
    z.number({
      error: (issue) =>
        issue.input === undefined
          ? "Informe a quantidade de adultos."
          : "Quantidade inválida.",
    })
    .int("Informe um número inteiro.")
    .min(1, "Informe a quantidade de adultos")
  ),
  criancas: z
    .string({
      error: (issue) =>
        issue.input === undefined
          ? "Informe sobre crianças na casa."
          : "Valor inválido.",
    })
    .trim()
    .min(1, "Informe sobre crianças na casa"),
  renda_mensal: z
    .string({
      error: (issue) =>
        issue.input === undefined
          ? "Informe a renda mensal."
          : "Valor inválido.",
    })
    .trim()
    .min(1, "Informe a renda mensal"),
  acordo: z
    .string({
      error: (issue) =>
        issue.input === undefined ? "Selecione uma opção." : "Opção inválida.",
    })
    .trim()
    .min(1, "Selecione uma opção")
    .refine((value) => ["Sim", "Não", "Talvez"].includes(value), "Selecione uma opção válida."),
  alergia: z
    .string({
      error: (issue) =>
        issue.input === undefined
          ? "Responda sobre alergias."
          : "Valor inválido.",
    })
    .trim()
    .min(1, "Responda sobre alergias"),
});

export const step3Schema = z.object({
  motivo: z
    .string({
      error: (issue) =>
        issue.input === undefined ? "Descreva o motivo." : "Valor inválido.",
    })
    .trim()
    .min(5, "Descreva o motivo"),
  animal_especifico: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z
      .string({
        error: (issue) =>
          issue.input === undefined ? "Informe o animal." : "Valor inválido.",
      })
      .trim()
    .min(1, "Informe o animal")
      .optional(),
  ),
  porte: z
    .string({
      error: (issue) =>
        issue.input === undefined ? "Selecione o porte." : "Opção inválida.",
    })
    .trim()
    .min(1, "Selecione o porte")
    .refine((value) => ["Nao Importa", "Mini", "Pequeno", "Pequeno Médio", "Medio", "Grande"].includes(value), "Selecione uma opção válida."),
  sexo: z.string().trim().default("Não importa")
    .refine((value) => ["Fêmea", "Macho", "Não importa"].includes(value), "Selecione uma opção válida."),
  idade_animal: z
    .string({
      error: (issue) =>
        issue.input === undefined ? "Selecione a idade." : "Opção inválida.",
    })
    .trim()
    .min(1, "Selecione a idade")
    .refine((value) => ["Nao importa", "Filhote", "Adulto Jovem", "Adulto Maduro", "Idoso"].includes(value), "Selecione uma opção válida."),
  personalidade: z
    .string({
      error: (issue) =>
        issue.input === undefined
          ? "Selecione a personalidade."
          : "Opção inválida.",
    })
    .trim()
    .min(1, "Selecione a personalidade")
    .refine((value) => ["Brincalhao", "Super Ativo", "Independente", "Carente", "Grudinho", "Para Correr"].includes(value), "Selecione uma opção válida."),
  atividade: z
    .string({
      error: (issue) =>
        issue.input === undefined
          ? "Selecione a atividade."
          : "Opção inválida.",
    })
    .trim()
    .min(1, "Selecione a atividade")
    .refine((value) => ["Companhia", "Guarda"].includes(value), "Selecione uma opção válida."),
});

export const step4Schema = z.object({
  responsavel: z
    .string({
      error: (issue) =>
        issue.input === undefined
          ? "Informe o responsável."
          : "Valor inválido.",
    })
    .trim()
    .min(2, "Informe o responsável"),
  horas_sozinho: z
    .string({
      error: (issue) =>
        issue.input === undefined ? "Informe as horas." : "Valor inválido.",
    })
    .trim()
    .min(1, "Informe as horas"),
  passeios: z
    .string({
      error: (issue) =>
        issue.input === undefined
          ? "Informe sobre passeios."
          : "Valor inválido.",
    })
    .trim()
    .min(1, "Informe sobre passeios"),
  tipo_moradia: z
    .string({
      error: (issue) =>
        issue.input === undefined
          ? "Selecione o tipo de moradia."
          : "Opção inválida.",
    })
    .trim()
    .min(1, "Selecione o tipo de moradia")
    .refine((value) => ["Propria", "Alugada"].includes(value), "Selecione uma opção válida."),
  proprietario_permite: z.string().trim().default("Nao aplica")
    .refine((value) => ["Sim", "Não", "Nao sei", "Nao aplica"].includes(value), "Selecione uma opção válida."),
  detalhes_moradia: z
    .string({
      error: (issue) =>
        issue.input === undefined
          ? "Selecione os detalhes."
          : "Opção inválida.",
    })
    .trim()
    .min(1, "Selecione os detalhes")
    .refine((value) => ["Casa quintal", "Casa quintal compartilhado", "Casa sem quintal", "Muros altos", "Com Telas", "Portao Fechado", "Tudo fechado", "Ap telas total", "Ap telas parcial", "Ap sem telas", "Ap colocarei", "Ap varanda fechada", "Ap varanda aberta"].includes(value), "Selecione uma opção válida."),
  moradores: z
    .string({
      error: (issue) =>
        issue.input === undefined ? "Informe os moradores." : "Valor inválido.",
    })
    .trim()
    .min(1, "Informe os moradores"),
  areas_frequentar: z
    .string({
      error: (issue) =>
        issue.input === undefined ? "Informe as áreas." : "Valor inválido.",
    })
    .trim()
    .min(1, "Informe as áreas"),
  periodos: z
    .string({
      error: (issue) =>
        issue.input === undefined ? "Informe os períodos." : "Valor inválido.",
    })
    .trim()
    .min(1, "Informe os períodos"),
  dormir: z
    .string({
      error: (issue) =>
        issue.input === undefined
          ? "Informe onde o animal dormirá."
          : "Valor inválido.",
    })
    .trim()
    .min(1, "Informe onde o animal dormirá"),
  acesso: z
    .string({
      error: (issue) =>
        issue.input === undefined ? "Selecione o acesso." : "Opção inválida.",
    })
    .trim()
    .min(1, "Selecione o acesso")
    .refine((value) => ["Total", "Parcial", "Restrito", "Outro"].includes(value), "Selecione uma opção válida."),
});

export const step5Schema = z.object({
  outros_animais: z
    .string({
      error: (issue) =>
        issue.input === undefined
          ? "Responda sobre outros animais."
          : "Valor inválido.",
    })
    .trim()
    .min(1, "Responda sobre outros animais"),
  castrados: z
    .string({
      error: (issue) =>
        issue.input === undefined
          ? "Responda sobre castração."
          : "Valor inválido.",
    })
    .trim()
    .min(1, "Responda sobre castração"),
  ja_teve: z
    .string({
      error: (issue) =>
        issue.input === undefined
          ? "Responda sobre animais anteriores."
          : "Valor inválido.",
    })
    .trim()
    .min(1, "Responda sobre animais anteriores"),
  destino_antigos: z
    .string({
      error: (issue) =>
        issue.input === undefined
          ? "Responda sobre os animais anteriores."
          : "Valor inválido.",
    })
    .trim()
    .min(1, "Responda sobre os animais anteriores"),
  veterinario: z
    .string({
      error: (issue) =>
        issue.input === undefined
          ? "Informe o veterinário."
          : "Valor inválido.",
    })
    .trim()
    .min(1, "Informe o veterinário"),
  racao: z
    .string({
      error: (issue) =>
        issue.input === undefined ? "Informe a ração." : "Valor inválido.",
    })
    .trim()
    .min(1, "Informe a ração"),
});

export const step6Schema = z.object({
  coleira: z
    .string({
      error: (issue) =>
        issue.input === undefined ? "Selecione uma opção." : "Opção inválida.",
    })
    .trim()
    .min(1, "Selecione uma opção")
    .refine((value) => ["Sim", "Não", "Talvez"].includes(value), "Selecione uma opção válida."),
  ciencia_adaptacao: z
    .string({
      error: (issue) =>
        issue.input === undefined ? "Selecione uma opção." : "Opção inválida.",
    })
    .trim()
    .min(1, "Selecione uma opção")
    .refine((value) => ["Sim", "Não", "Talvez"].includes(value), "Selecione uma opção válida."),
  tempo_adaptacao: z
    .string({
      error: (issue) =>
        issue.input === undefined ? "Informe o tempo." : "Valor inválido.",
    })
    .trim()
    .min(1, "Informe o tempo"),
  adestrador: z
    .string({
      error: (issue) =>
        issue.input === undefined ? "Selecione uma opção." : "Opção inválida.",
    })
    .trim()
    .min(1, "Selecione uma opção")
    .refine((value) => ["Sim", "Não"].includes(value), "Selecione uma opção válida."),
  motivo_nao_adestrar: z.string().trim().optional()
    .refine((value) => value === undefined || value === "" || ["Nao se aplica", "Eu ensinarei", "Muito caro", "Nao acredito", "Outro"].includes(value), "Selecione uma opção válida."),
  carro: z
    .string({
      error: (issue) =>
        issue.input === undefined ? "Selecione uma opção." : "Opção inválida.",
    })
    .trim()
    .min(1, "Selecione uma opção")
    .refine((value) => ["Sim", "Não"].includes(value), "Selecione uma opção válida."),
  financeiro_vet: z
    .string({
      error: (issue) =>
        issue.input === undefined ? "Selecione uma opção." : "Opção inválida.",
    })
    .trim()
    .min(1, "Selecione uma opção")
    .refine((value) => ["Sim", "Nao", "Plano", "Publico", "Outro"].includes(value), "Selecione uma opção válida."),
  vacinas: z
    .string({
      error: (issue) =>
        issue.input === undefined ? "Selecione uma opção." : "Opção inválida.",
    })
    .trim()
    .min(1, "Selecione uma opção")
    .refine((value) => ["Sim", "Não", "Talvez"].includes(value), "Selecione uma opção válida."),
  gasto_mensal: z
    .string({
      error: (issue) =>
        issue.input === undefined ? "Selecione uma opção." : "Opção inválida.",
    })
    .trim()
    .min(1, "Selecione uma opção")
    .refine((value) => ["100-150", "150-250", "250-300", "acima 300", "Outro"].includes(value), "Selecione uma opção válida."),
});

export const step7Schema = z.object({
  divulgacao: z
    .string({
      error: (issue) =>
        issue.input === undefined ? "Informe onde viu." : "Valor inválido.",
    })
    .trim()
    .min(1, "Informe onde viu"),
  noticias: z
    .string({
      error: (issue) =>
        issue.input === undefined ? "Selecione uma opção." : "Opção inválida.",
    })
    .trim()
    .min(1, "Selecione uma opção")
    .refine((value) => ["Sim", "Não", "Talvez"].includes(value), "Selecione uma opção válida."),
  visitas: z
    .string({
      error: (issue) =>
        issue.input === undefined ? "Selecione uma opção." : "Opção inválida.",
    })
    .trim()
    .min(1, "Selecione uma opção")
    .refine((value) => ["Sim", "Não"].includes(value), "Selecione uma opção válida."),
  fotos_adocao: z
    .string({
      error: (issue) =>
        issue.input === undefined ? "Selecione uma opção." : "Opção inválida.",
    })
    .trim()
    .min(1, "Selecione uma opção")
    .refine((value) => ["Sim", "Não"].includes(value), "Selecione uma opção válida."),
  contribuicao: z
    .string({
      error: (issue) =>
        issue.input === undefined ? "Selecione uma opção." : "Opção inválida.",
    })
    .trim()
    .min(1, "Selecione uma opção")
    .refine((value) => ["Sim", "Não"].includes(value), "Selecione uma opção válida."),
  compromisso_vida: z
    .string({
      error: (issue) =>
        issue.input === undefined ? "Selecione uma opção." : "Opção inválida.",
    })
    .trim()
    .min(1, "Selecione uma opção")
    .refine((value) => ["Sim", "Não", "Talvez"].includes(value), "Selecione uma opção válida."),
});

export const step8Schema = z.object({
  gravidez: z
    .string({
      error: (issue) =>
        issue.input === undefined
          ? "Responda com detalhes."
          : "Valor inválido.",
    })
    .trim()
    .min(3, "Responda com detalhes"),
  viagem: z
    .string({
      error: (issue) =>
        issue.input === undefined
          ? "Responda com detalhes."
          : "Valor inválido.",
    })
    .trim()
    .min(3, "Responda com detalhes"),
  mudanca_menor: z
    .string({
      error: (issue) =>
        issue.input === undefined
          ? "Responda com detalhes."
          : "Valor inválido.",
    })
    .trim()
    .min(3, "Responda com detalhes"),
  mudanca_longe: z
    .string({
      error: (issue) =>
        issue.input === undefined
          ? "Responda com detalhes."
          : "Valor inválido.",
    })
    .trim()
    .min(3, "Responda com detalhes"),
  separacao: z
    .string({
      error: (issue) =>
        issue.input === undefined
          ? "Responda com detalhes."
          : "Valor inválido.",
    })
    .trim()
    .min(3, "Responda com detalhes"),
  falecimento: z
    .string({
      error: (issue) =>
        issue.input === undefined
          ? "Responda com detalhes."
          : "Valor inválido.",
    })
    .trim()
    .min(3, "Responda com detalhes"),
});

export const step9Schema = z.object({
  perder: z
    .string({
      error: (issue) =>
        issue.input === undefined ? "Responda a questão." : "Valor inválido.",
    })
    .trim()
    .min(3, "Responda a questão"),
  doenca: z
    .string({
      error: (issue) =>
        issue.input === undefined ? "Responda a questão." : "Valor inválido.",
    })
    .trim()
    .min(3, "Responda a questão"),
  morder: z
    .string({
      error: (issue) =>
        issue.input === undefined ? "Responda a questão." : "Valor inválido.",
    })
    .trim()
    .min(3, "Responda a questão"),
  destruicao: z
    .string({
      error: (issue) =>
        issue.input === undefined ? "Responda a questão." : "Valor inválido.",
    })
    .trim()
    .min(3, "Responda a questão"),
  xixi_errado: z
    .string({
      error: (issue) =>
        issue.input === undefined ? "Responda a questão." : "Valor inválido.",
    })
    .trim()
    .min(3, "Responda a questão"),
});

export const step10Schema = z.object({
  enxoval: z
    .string({
      error: (issue) =>
        issue.input === undefined ? "Responda a questão." : "Valor inválido.",
    })
    .trim()
    .min(3, "Responda a questão"),
  devolucao: z
    .string({
      error: (issue) =>
        issue.input === undefined ? "Responda a questão." : "Valor inválido.",
    })
    .trim()
    .min(3, "Responda a questão"),
  termo_nao_repassar: z
    .string({
      error: (issue) =>
        issue.input === undefined ? "Selecione uma opção." : "Opção inválida.",
    })
    .trim()
    .min(1, "Selecione uma opção")
    .refine((value) => ["Sim", "Não"].includes(value), "Selecione uma opção válida."),
  obs: z.string().trim().optional(),
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

export const adoptionFormSchema = z.object({
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
});

export const fullFormSchema = adoptionFormSchema.extend({ captchaToken: z.string().trim() });

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
