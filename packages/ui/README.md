# Jaci UI

Design system compartilhado pelos aplicativos público e administrativo do
Abrigo do Wlad. O pacote npm do workspace é `@jaci/ui`. Alguns componentes
interativos são construídos sobre [Radix Primitives](https://www.radix-ui.com/primitives),
que fornece a base de comportamento e acessibilidade. O Jaci UI define a API de
uso, a composição, os estilos e a identidade visual aplicada sobre essa base.

## Galeria e exportação

A galeria visual reúne composições editoriais dos componentes em temas claro e
escuro. Sua direção parte dos ciclos da natureza: o tema claro evoca o
amanhecer, enquanto o escuro atravessa o entardecer e o anoitecer. Para abri-la
no navegador a partir da raiz do monorepo:

```sh
npm run gallery --workspace @jaci/ui
```

As composições também podem ser exportadas em WebP com Chromium e Playwright.
Na primeira execução, instale o navegador gerenciado pelo Playwright:

```sh
npx playwright install chromium
```

Exporte todas as cenas para `packages/ui/exports`:

```sh
npm run export:gallery --workspace @jaci/ui
```

O diretório de saída contém as imagens e um `manifest.json` com título,
descrição, tema e dimensões de cada arquivo. Ele é ignorado pelo Git. Consulte
as opções ou exporte cenas específicas com:

```sh
npm run export:gallery --workspace @jaci/ui -- --help
npm run export:gallery --workspace @jaci/ui -- \
  --scene actions,cards \
  --theme dark \
  --quality 92 \
  --scale 2 \
  --out /caminho/do/portfolio/public/jaci
```

## Fundação visual

Importe a fundação uma única vez no ponto de entrada de cada aplicação:

```css
@import "@jaci/ui/styles.css";
```

Esse arquivo fornece a paleta original do painel público, tokens semânticos,
tema escuro, tipografia, foco, reset e utilitários globais. Aplicações podem
ajustar densidade e composição, mas devem consumir tokens como
`--text-primary`, `--surface-card`, `--border` e `--primary` em vez de declarar
novas cores.

Títulos de destaque, títulos de seção e labels em caixa-alta devem consumir,
respectivamente, `--tracking-display`, `--tracking-heading` e
`--tracking-label`.
## Componentes

Os componentes são exportados por subcaminho:

```tsx
import { Button } from "@jaci/ui/Button";
import { Toggle } from "@jaci/ui/Toggle";
import { Field, Input, NativeSelect, Textarea } from "@jaci/ui/Field";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogHeading,
  DialogIcon,
} from "@jaci/ui/Dialog";
```

### Botões e links

`Button` executa ações e renderiza um `<button>`. Para navegação com a mesma
aparência, use `ButtonLink`, que renderiza um `<a>` e compartilha os estilos,
variantes, tamanhos e opções de ícones do botão:

```tsx
import { Button, ButtonLink } from "@jaci/ui/Button";

<Button type="submit">Salvar</Button>
<ButtonLink href="https://example.com" target="_blank" rel="noopener noreferrer">
  Visitar loja
</ButtonLink>
```

`Toggle` é um switch controlado. `thumbContent` aceita um ícone ou outro
conteúdo visual para o indicador:

```tsx
<Toggle
  checked={enabled}
  onCheckedChange={setEnabled}
  aria-label="Ativar notificações"
/>
```

Nas variantes de cor (`primary`, `secondary`, `success` e `danger`), a propriedade
`emphasis` controla a presença visual sem adicionar bordas, gradientes ou sombras:

- `strong`: preenchimento intenso e texto contrastante para ações principais.
- `soft` (padrão): preserva o preenchimento tonal suave existente.
- `minimal`: fundo transparente e texto colorido, com fundo tonal no hover.

As cores consomem os tokens de cada tema: ações fortes têm texto claro no tema
claro e texto escuro sobre cores luminosas no tema escuro. As variantes utilitárias
`outline`, `ghost` e `text` mantêm seu tratamento próprio, sem efeito de `emphasis`.

```tsx
<ButtonLink href="https://example.com" variant="primary" emphasis="strong">
  Visitar loja
</ButtonLink>
<Button variant="primary" emphasis="minimal">Ver detalhes</Button>
```

### Estados vazios e indisponibilidade

`EmptyState` apresenta ausência de resultados, falhas de carregamento e
indisponibilidade temporária. O componente fornece o fundo tonal do ícone
(`--surface-water`), sua cor, tamanho e espaçamento, além de marcá-lo como
decorativo. Passe o ícone diretamente em `icon`, sem contêiner, cor ou tamanho
local. O tamanho do conjunto é controlado por `size` (`sm`, `md` ou `lg`).

```tsx
import { SearchX } from "lucide-react";
import { EmptyState } from "@jaci/ui/EmptyState";

<EmptyState
  icon={<SearchX />}
  title="Nenhum resultado por aqui"
  description="Tente remover alguns filtros ou buscar por outro nome."
  headingLevel={2}
  size="lg"
  actions={<Button variant="outline">Limpar filtros</Button>}
/>
```

Use `actions` para as ações disponíveis, sem margens locais para separar o botão
do conteúdo. Em falhas anunciadas dinamicamente, use `role="alert"` no
`EmptyState`. O ícone não substitui o título descritivo.

### Campos de formulário

`Field` reúne label, controle, descrição, obrigatoriedade e erro. `Input`,
`NativeSelect` e `Textarea` herdam o tamanho e os atributos acessíveis do campo:

```tsx
<Field
  controlId="dog-temperament"
  label="Temperamento"
  description={(
    <>
      <span>Use um resumo curto exibido no card público.</span>
      <span>{temperament.length}/120</span>
    </>
  )}
  required
>
  <Input
    value={temperament}
    onChange={event => setTemperament(event.target.value)}
  />
</Field>
```

Os tamanhos disponíveis são `sm`, `md` e `lg`; `md` é o padrão. O tamanho pode
ser definido no `Field` para todos os seus controles ou diretamente no controle
para sobrescrever o valor herdado. A descrição é opcional, aparece abaixo do
controle com a cor `--text-muted` e é ligada ao controle por
`aria-describedby`. `error` usa o mesmo mecanismo, aplica o estado inválido e
anuncia a mensagem como alerta.

### Diálogos

Baseado em `@radix-ui/react-dialog`, com composição e identidade visual
definidas pelo Jaci UI.

Diálogos simples continuam usando o layout padrão. Superfícies maiores, com
cabeçalho, conteúdo rolável e ações persistentes, devem optar pelo layout
estruturado e por um tamanho oficial:

```tsx
<DialogContent size="xl" layout="structured" mobileMode="fullscreen">
  <DialogHeader>...</DialogHeader>
  <DialogBody>...</DialogBody>
  <DialogFooter>...</DialogFooter>
</DialogContent>
```

Os tamanhos disponíveis são `sm`, `md`, `lg`, `xl` e `fullscreen-mobile`.
Quando omitido, o tamanho padrão é `md`.
O último preserva a geometria padrão ou definida pelo consumidor em telas
maiores e ocupa a área útil do viewport em telas pequenas.

Quando o diálogo precisa combinar um tamanho explícito no desktop com tela
cheia no mobile, use `mobileMode="fullscreen"`. O valor legado
`size="fullscreen-mobile"` continua disponível para consumidores que não
definem outra largura de desktop.

#### Cabeçalho semântico

Diálogos semânticos, como confirmação, sucesso, alerta e erro, devem usar o
ícone oficial. O ícone continua opcional para diálogos funcionais, como
formulários, mapas e visualização de dados.

```tsx
<DialogContent size="sm">
  <DialogHeader>
    <DialogIcon tone="danger">
      <AlertTriangle />
    </DialogIcon>
    <DialogHeading>
      <DialogTitle>Excluir registro?</DialogTitle>
      <DialogDescription>
        Esta ação não poderá ser desfeita.
      </DialogDescription>
    </DialogHeading>
  </DialogHeader>
  <DialogFooter>...</DialogFooter>
</DialogContent>
```

Em `sm`, ícone, título e descrição ficam empilhados e centralizados. Nos
diálogos semânticos que usam `DialogIcon`, o texto de `DialogBody` e as ações
de `DialogFooter` também são centralizados, mantendo um único eixo de leitura.
Use esses componentes para o conteúdo de apoio e as ações, sem alinhamentos locais. Nos
demais tamanhos, o ícone fica à esquerda do conjunto de título e descrição.
Os tons disponíveis são `neutral`, `primary`, `info`, `success`, `warning` e
`danger`. O ícone é decorativo por padrão e não substitui um título descritivo.

Componentes de aplicação, como navegação e layouts de página, permanecem nos
respectivos aplicativos. Primitivos, comportamento acessível e identidade
visual pertencem ao Jaci UI.

## Licença

O Jaci UI é disponibilizado sob a [Licença MIT](LICENSE.txt), com autoria de
Luis Gustavo R.C. e Alan Climaco.
