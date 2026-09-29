# Aplicação pública

Site público do Abrigo do Wlad, responsável pela divulgação dos animais, pelo
formulário de adoção, pelos pontos de reciclagem, pelas campanhas de apoio e pelo
conteúdo institucional.

## Funcionalidades

- Página inicial com campanhas, formas de apoio e animal em destaque.
- Catálogo de cães disponíveis para adoção.
- Formulário de candidatura em múltiplas etapas.
- Página institucional sobre o abrigo.
- Relação de pontos parceiros de reciclagem.
- Política de privacidade.
- Tema claro e escuro, layout responsivo e integração com VLibras.

## Estrutura

```text
apps/public/
├── public/              # Arquivos servidos sem transformação
├── src/
│   ├── assets/          # Imagens e metadados
│   ├── components/      # Componentes do site
│   ├── hooks/           # Hooks React
│   ├── lib/             # Configurações e utilitários
│   ├── pages/           # Páginas e fluxos da aplicação
│   ├── services/        # Integrações do frontend
│   ├── types/           # Tipos do domínio
│   └── routes.tsx       # Rotas da SPA
├── package.json
└── vite.config.ts
workers/
├── app/index.ts         # Worker HTTP do site e da API pública
├── cron/index.ts        # Tarefas agendadas
└── shared/api/          # Serviços utilizados pelos Workers
```

Componentes genéricos compartilhados com o painel administrativo ficam no
workspace `@jaci/ui`, em [`packages/ui`](../../packages/ui).

## Desenvolvimento local

Na raiz do monorepo:

```bash
npm install
cp .env.example .env
npm run dev:public
```

O servidor Vite utiliza o plugin do Cloudflare para executar o frontend e o
Worker da aplicação durante o desenvolvimento.

## Variáveis de ambiente

As variáveis `VITE_*` são incorporadas ao bundle e, portanto, são públicas. O
arquivo [`.env.example`](../../.env.example) contém a relação completa de
valores aceitos.

### Build do frontend

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_RECAPTCHA_PUBLIC_KEY`
- `VITE_PUBLIC_APP_URL`

### Runtime do Worker público

- `ALLOWED_ORIGIN`
- `RECAPTCHA_SECRET_KEY`
- `MASTER_KEY`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`
- `GMAIL_USER`
- `GMAIL_PASS`
- `ADOPTION_EMAIL_RECIPIENT`
- `DEBUG_EMAIL_RECIPIENT`
- `ADMIN_PANEL_URL`

Credenciais privadas pertencem ao runtime do Worker e não devem utilizar o
prefixo `VITE_` nem ser versionadas.

## API pública

O Worker definido em [`workers/app/index.ts`](../../workers/app/index.ts) serve
os Static Assets da SPA e processa as rotas `/api/*`.

| Método | Rota | Função |
| --- | --- | --- |
| `GET` | `/api/hero-dog` | Retorna o animal em destaque. |
| `GET` | `/api/dogs` | Retorna uma página filtrada do catálogo rotativo armazenado no KV. |
| `GET` | `/api/dogs/by-slug/:publicSlug` | Retorna o perfil público de um cão pelo slug canônico. |
| `POST` | `/api/adoption/create` | Valida e registra uma candidatura de adoção. |
| `GET` | `/api/tests/email` | Testa o envio de e-mail apenas em desenvolvimento. |

Cada cão publicado no feed possui um `publicSlug` gerado automaticamente a
partir de `nome` (por exemplo, `Paçoca` torna-se `pacoca`). O slug é reservado
no KV, permanece estável mesmo quando o nome é alterado e recebe um sufixo
numérico em caso de colisão (`pacoca-2`). Não é necessário editar esse campo no
painel administrativo.

### Perfil por slug

A página pública canônica usa o formato `/caes/:publicSlug`, por exemplo
`/caes/pacoca`. O mesmo identificador é aceito pela API:
`GET /api/dogs/by-slug/pacoca`.

Em caso de sucesso, o endpoint retorna `200` com o perfil disponível:

```json
{
  "state": "available",
  "dog": {
    "id": "dog-123",
    "publicSlug": "pacoca",
    "nome": "Paçoca"
  }
}
```

Quando o cão foi adotado ou removido do catálogo, o endpoint retorna `410` e
preserva os dados mínimos do tombstone, incluindo `id`, `publicSlug`, `nome`,
`status` e `removedAt`:

```json
{
  "state": "unavailable",
  "tombstone": {
    "schemaVersion": 1,
    "id": "dog-123",
    "publicSlug": "pacoca",
    "nome": "Paçoca",
    "status": "adopted",
    "removedAt": "2026-08-28T12:00:00.000Z"
  }
}
```

O endpoint retorna `400` para slugs inválidos, `404` quando não há cão nem
tombstone correspondente e `503` quando o armazenamento está temporariamente
indisponível. Rotas de perfil baseadas diretamente no ID não fazem parte do
contrato público.

`POST /api/adoption/create` exige um cabeçalho `Idempotency-Key` com UUID v4.
Tentativas repetidas com a mesma chave retornam a candidatura já registrada sem
duplicar o documento ou a notificação.

Os dados sensíveis da candidatura são criptografados antes da persistência. O
acesso server-side ao Firestore utiliza a API REST e credenciais de service
account mantidas no runtime.

## Worker agendado

O Worker [`workers/cron/index.ts`](../../workers/cron/index.ts) executa
diariamente três tarefas:

- atualização do animal em destaque armazenado no KV;
- reconstrução determinística do catálogo rotativo de cães armazenado no KV;
- identificação e remoção de candidaturas vencidas conforme a política de
  retenção.

Cães arquivados ficam fora do catálogo e da seleção de destaque. Cada registro
recebe um prazo individual de 30 dias em `purgeAfter`, mas a exclusão automática
de cães ainda não está habilitada.

O endpoint `/api/dogs` aceita `page`, `limit`, `cateIdade`, `cor`, `tag` e uma
`version` opcional. A versão mantém a ordem estável entre páginas; versões
anteriores permanecem disponíveis temporariamente para sessões em andamento.

O comportamento da limpeza é definido por `ADOPTION_CLEANUP_MODE`:

| Valor | Comportamento |
| --- | --- |
| `disabled` | Não consulta nem remove candidaturas. |
| `dry-run` | Registra nos logs os documentos elegíveis sem removê-los. |
| `delete` | Remove os documentos elegíveis. |

## Build, verificação e publicação

```bash
npm run build:public
npm run check:public-worker
npm run typecheck:worker
npm run test:worker
npm run deploy:public
```

O Worker agendado possui ciclo independente:

```bash
npm run build:cron
npm run deploy:cron
```

As configurações de publicação ficam em [`wrangler.jsonc`](../../wrangler.jsonc)
e [`workers/cron/wrangler.jsonc`](../../workers/cron/wrangler.jsonc). O diagrama
do fluxo está em [`docs/architecture.svg`](../../docs/architecture.svg).
