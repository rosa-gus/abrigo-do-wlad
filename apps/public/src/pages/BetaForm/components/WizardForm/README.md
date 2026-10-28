# WizardForm

> ⚠️ **ATENÇÃO:** Essa é uma alternativa ao formulário tradicional (Google Forms) e ainda está em **Beta**. O principal objetivo é **reduzir a carga cognitiva** do usuário, dividindo o formulário extenso em etapas menores e evitando que ele desista no meio do caminho.

## Visão Geral

O `WizardForm` é um formulário multi-step (wizard) para o **processo de entrevista de adoção** do Abrigo do Wlad. Ele guia o adotante por **10 etapas** com validação por step, barra de progresso visual e envio via **API própria**.

### Fluxo do Usuário

```
4 Avisos Iniciais → Step 1 → Step 2 → ... → Step 10 → Envio (API) → Tela de Sucesso
```

1. O usuário navega por quatro avisos sobre compromisso, processo, responsáveis
   e taxa de adoção e confirma que está ciente para prosseguir.
2. Avança pelas 10 etapas, podendo navegar para steps anteriores já preenchidos.
3. No último step, envia o formulário com verificação automática pelo reCAPTCHA v3.
4. Recebe uma tela de confirmação de envio.

Em `npm run dev:public`, o reCAPTCHA é dispensado e o webhook usa o destinatário
de testes. Builds e preview mantêm a verificação. Veja o [guia público](../../../../../README.md).

---

## Estrutura de Arquivos

```
WizardForm/
├── index.tsx                 # Componente principal do wizard
├── useWizardForm.ts          # Hook com lógica de navegação, estado e validação
├── schema.ts                 # Schemas Zod para validação de cada step
├── FieldWrapper.tsx           # Wrapper reutilizável para campos com label e erro
├── WizardForm.module.css     # Estilos (CSS Modules)
├── README.md                 # Esta documentação
└── steps/
    ├── index.ts              # Barrel file (re-exporta os steps)
    ├── Step1DadosPessoais.tsx # Etapa 1: Dados pessoais do adotante
    ...
    └── Step10Finalizacao.tsx  # Etapa 10: Enxoval, termo, observações
```

---

## Componentes

### `WizardForm` (index.tsx)

Componente principal que orquestra todo o fluxo do wizard.

**Responsabilidades:**

- Renderiza os **quatro avisos** iniciais, fora da contagem das etapas do
  formulário.
- Exibe a **barra de progresso** e os **indicadores de step** com tooltips.
- Controla qual step é exibido via `renderStep()`.
- Envia os dados para a API (`POST /api/adoption/create`).
- Suporta **pré-preenchimento** do nome do pet via query param `?pet=Nome`.
- Integra reCAPTCHA para evitar spam.

**Integrações:**

- `react-router` — leitura de search params (`?pet=`)
- `lucide-react` — ícones
- Componentes UI internos: `Card`, `Button`, `Badge`, `Tooltip`

---

### `useWizardForm`

Hook customizado que encapsula toda a lógica de estado e navegação do wizard.

**Retorno:**

| Propriedade           | Tipo                                                       | Descrição                                      |
| --------------------- | ---------------------------------------------------------- | ---------------------------------------------- |
| `currentStep`         | `number`                                                   | Índice do step atual (0-indexed)               |
| `totalSteps`          | `number`                                                   | Quantidade total de steps (10)                 |
| `isFirstStep`         | `boolean`                                                  | Se está no primeiro step                       |
| `isLastStep`          | `boolean`                                                  | Se está no último step                         |
| `progress`            | `number`                                                   | Percentual de progresso (0-100)                |
| `formData`            | `Partial<FormData>`                                        | Dados preenchidos até o momento                |
| `errors`              | `FieldError`                                               | Erros de validação por campo                   |
| `updateField`         | `(field: keyof FormData, value: string \| number) => void` | Atualiza um campo e limpa seu erro             |
| `nextStep`            | `() => void`                                               | Avança para o próximo step (valida antes)      |
| `prevStep`            | `() => void`                                               | Volta para o step anterior                     |
| `goToStep`            | `(step: number) => void`                                   | Navega para um step específico (só anteriores) |
| `validateCurrentStep` | `() => boolean`                                            | Valida os campos do step atual via Zod         |
| `setErrors`           | `React.Dispatch<...>`                                      | Setter direto dos erros (uso avançado)         |

**Títulos dos Steps (`STEP_TITLES`):**

| #   | Título                     |
| --- | -------------------------- |
| 1   | Dados Pessoais             |
| 2   | Família e Renda            |
| 3   | Sobre a Adoção             |
| 4   | Rotina e Moradia           |
| 5   | Histórico e Veterinário    |
| 6   | Responsabilidades          |
| 7   | Termos Finais              |
| 8   | O que acontecerá se...     |
| 9   | O que faria se o animal... |
| 10  | Finalização                |

---

### `schema.ts`

Define os schemas de validação [Zod](https://zod.dev/) para cada step, além de tipos TypeScript inferidos.

**Exports principais:**

| Export           | Descrição                                                        |
| ---------------- | ---------------------------------------------------------------- |
| `step1Schema`    | Validação do Step 1 (nome, idade, estado civil, profissão, etc.) |
| `step2Schema`    | Validação do Step 2 (adultos, crianças, renda, acordo, alergia)  |
| `step3Schema`    | Validação do Step 3 (motivo, animal, porte, sexo, etc.)          |
| `step4Schema`    | Validação do Step 4 (moradia, rotina, áreas, etc.)               |
| `step5Schema`    | Validação do Step 5 (histórico com animais, veterinário, ração)  |
| `step6Schema`    | Validação do Step 6 (coleira, adestrador, gastos, vacinas)       |
| `step7Schema`    | Validação do Step 7 (divulgação, visitas, compromisso)           |
| `step8Schema`    | Validação do Step 8 (cenários hipotéticos de vida)               |
| `step9Schema`    | Validação do Step 9 (cenários de comportamento do animal)        |
| `step10Schema`   | Validação do Step 10 (enxoval, devolução, termo, observações)    |
| `stepSchemas`    | Array com todos os schemas na ordem dos steps                    |
| `fullFormSchema` | Schema completo mesclando todos os steps                         |
| `FormData`       | Tipo TypeScript inferido do `fullFormSchema`                     |
| `Step1Data`, ... | Tipos individuais inferidos de cada step schema                  |

**Exemplo de schema (Step 1):**

```ts
export const step1Schema = z.object({
  nome_adotante: z.string().min(3, "Nome deve ter pelo menos 3 caracteres"),
  idade: z.coerce.number().min(18, "Deve ter pelo menos 18 anos"),
  estado_civil: z.string().min(1, "Selecione o estado civil"),
  // ...
});
```

---

### `FieldWrapper` (FieldWrapper.tsx)

Componente wrapper reutilizável que padroniza a renderização de campos do formulário.

**Props:**

| Prop       | Tipo              | Obrigatório | Descrição                                  |
| ---------- | ----------------- | ----------- | ------------------------------------------ |
| `name`     | `string`          | ✅          | Nome do campo (chave em `FormData`)        |
| `label`    | `string`          | ✅          | Texto do label                             |
| `required` | `boolean`         | ❌          | Exibe asterisco vermelho (padrão: `false`) |
| `errors`   | `FieldError`      | ✅          | Objeto de erros para exibir mensagem       |
| `children` | `React.ReactNode` | ✅          | Input, Select, RadioGroup, Textarea, etc.  |

**Comportamento:**

- Aplica a classe `.fieldError` ao wrapper quando há erro no campo.
- Exibe o label com indicador de obrigatório (`*`) quando `required=true`.
- Renderiza a mensagem de erro abaixo do input.

---

## Steps (Componentes de Etapa)

Cada step é um componente funcional que recebe as mesmas props:

```ts
interface StepProps {
  formData: Partial<FormData>;
  errors: FieldError;
  updateField: (field: keyof FormData, value: string | number) => void;
}
```

### Steps implementados

| Step | Componente               | Campos                                                                                   |
| ---- | ------------------------ | ---------------------------------------------------------------------------------------- |
| 1    | `Step1DadosPessoais`     | Nome, idade, estado civil, profissão, empresa, endereço, telefone, e-mail, redes sociais |
| 2    | `Step2Familia`           | Qtd adultos, crianças, renda mensal, acordo, alergia                                     |
| 3    | `Step3Adocao`            | Motivo, animal específico, porte, sexo, idade, personalidade, atividade                  |
| 4    | `Step4Moradia`           | Responsável, horas sozinho, passeios, moradia, moradores, etc.                           |
| 5    | `Step5Historico`         | Outros animais, castrados, histórico, veterinário, ração                                 |
| 6    | `Step6Responsabilidades` | Coleira, adaptação, adestrador, carro, financeiro, vacinas                               |
| 7    | `Step7Termos`            | Divulgação, notícias, visitas, fotos, contribuição                                       |
| 8    | `Step8Hipoteticas`       | Cenários: gravidez, viagem, mudança, separação, falecimento                              |
| 9    | `Step9Situacoes`         | Cenários: perder, doença, morder, destruição, xixi errado                                |
| 10   | `Step10Finalizacao`      | Enxoval, devolução, termo, observações                                                   |

---

## Estilização

Utiliza **CSS Modules** via `WizardForm.module.css`. Classes principais:

| Classe             | Descrição                                           |
| ------------------ | --------------------------------------------------- |
| `.wizardContainer` | Container principal do wizard (900px, centralizado) |
| `.wizardHeader`    | Cabeçalho com progresso e indicadores               |
| `.progressBar`     | Barra de progresso visual                           |
| `.stepIndicators`  | Indicadores numéricos dos steps                     |
| `.stepContent`     | Container dos campos de cada step                   |
| `.field`           | Wrapper de campo individual                         |
| `.fieldRow`        | Grid de 2 colunas para campos lado a lado           |
| `.fieldError`      | Estilo de campo com erro (borda vermelha)           |
| `.errorSummary`    | Alerta de erro geral (campos obrigatórios)          |
| `.navigation`      | Container dos botões Anterior/Próximo               |
| `.subSection`      | Bloco destacado para agrupar campos                 |
| `.radioGroup`      | Layout horizontal para radio buttons                |

Animação de transição entre steps:

```css
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateX(10px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}
```

---

## Como Adicionar um Novo Step

1. **Crie o schema** em `schema.ts`:

   ```ts
   export const step3Schema = z.object({
     motivo: z.string().min(5, "Descreva o motivo"),
     // ...demais campos
   });
   ```

2. **Crie o componente** em `steps/Step3SobreAdocao.tsx`:

   ```tsx
   import { FieldWrapper } from "../FieldWrapper";
   import type { FormData } from "../schema";
   import type { FieldError } from "../useWizardForm";
   import styles from "../WizardForm.module.css";

   interface StepProps {
     formData: Partial<FormData>;
     errors: FieldError;
     updateField: (field: keyof FormData, value: string | number) => void;
   }

   export function Step3SobreAdocao({
     formData,
     errors,
     updateField,
   }: StepProps) {
     return (
       <div className={styles.stepContent}>
         <FieldWrapper
           name="motivo"
           label="3.1. Por que deseja adotar?"
           required
           errors={errors}
         >
           <textarea
             id="motivo"
             value={formData.motivo || ""}
             onChange={(e) => updateField("motivo", e.target.value)}
             rows={3}
           />
         </FieldWrapper>
         {/* ...demais campos */}
       </div>
     );
   }
   ```

3. **Exporte** no barrel file `steps/index.ts`:

   ```ts
   export { Step3SobreAdocao } from "./Step3SobreAdocao";
   ```

4. **Adicione o case** no `renderStep()` em `index.tsx`:
   ```tsx
   case 2:
     return <Step3SobreAdocao {...stepProps} />;
   ```

> O schema já está registrado em `stepSchemas` — o hook automaticamente valida o step correto pelo índice.

---

## Dependências

| Pacote         | Uso                                             |
| -------------- | ----------------------------------------------- |
| `zod`          | Validação de schemas por step                   |
| `react-router` | Leitura de query params (`?pet=`)               |
| `lucide-react` | Ícones (setas, check, alert, send)              |
| `fetch API`    | Envio de dados para API (`/api/adoption/create`) |

---

## Notas

- A navegação por `goToStep` permite voltar a steps anteriores, mas **não** permite pular para steps futuros não preenchidos.
- A cada transição de step, a página faz scroll suave para o topo (`window.scrollTo`).
- O nome do pet pode ser pré-preenchido via URL: `/formulario?pet=Rex`.
- A rota dinâmica permite *próximo* e *anterior* direto do navegador.
- Os dados são **salvos em sessão**, e não em um localStorage.
