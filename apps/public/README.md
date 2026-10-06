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

O frontend lê pontos de reciclagem e configurações públicas pela API do Worker.
O Worker acessa o Firestore via REST com conta de serviço e retorna somente os
campos públicos. O frontend mantém um cache JSON no localStorage por três horas
para reciclagem e uma hora para configurações, com fallback para dados antigos
em caso de falha na rede. A autenticação do
[painel administrativo](../admin/README.md) é feita pelo Cloudflare Access.

Na inicialização, o site remove chaves de versões antigas do cache no seu
namespace de localStorage. As versões são definidas por domínio em
`src/lib/storage.ts`; preferências e votos são preservados e precisam de uma
migração explícita caso seu formato seja alterado. Chaves de versões futuras
e de outros namespaces também são preservadas.

## Desenvolvimento local

Na raiz do monorepo:

```bash
npm install
cp .env.example .env
npm run dev:public
```

O servidor Vite utiliza o plugin do Cloudflare para executar o frontend e o
Worker da aplicação durante o desenvolvimento. As leituras públicas também
passam pelo Worker e precisam das credenciais Firestore de runtime locais.

O SDK Firebase é uma dependência de desenvolvimento da raiz, usado somente
pelos testes das Firestore Rules. Ele não faz parte da aplicação de produção.

## Variáveis de ambiente

As variáveis `VITE_*` são incorporadas ao bundle e, portanto, são públicas. O
arquivo [`.env.example`](../../.env.example) contém a relação completa de
valores aceitos.

### Build do frontend

- `VITE_RECAPTCHA_PUBLIC_KEY`
- `VITE_PUBLIC_APP_URL`

### Runtime do Worker público

- `ALLOWED_ORIGIN`
- `RECAPTCHA_SECRET_KEY`
- `MASTER_KEY`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`
- `EMAIL_WEBHOOK_URL`
- `EMAIL_WEBHOOK_SECRET`
- `ADMIN_PANEL_URL`

Credenciais privadas pertencem ao runtime do Worker e não devem utilizar o
prefixo `VITE_` nem ser versionadas.

### Notificações por e-mail

O Worker envia uma requisição `POST` ao Apps Script implantado com `secret`,
`subject`, `text`, `html` e `debug`. O código do Apps Script é mantido fora deste
repositório.
O destinatário é fixado no script: `debug: true` envia para a conta `.dev` e
qualquer outro valor envia para o abrigo. A rota de teste é a única que envia
`debug: true` e só funciona em desenvolvimento. O Worker só considera o envio
concluído quando recebe uma resposta JSON com `ok: true`.

Configure `EMAIL_WEBHOOK_URL` e `EMAIL_WEBHOOK_SECRET` como **Secrets** do Worker
público na Dashboard da Cloudflare. O segundo valor deve ser o mesmo da
propriedade `EMAIL_WEBHOOK_SECRET` no Apps Script. Não coloque a URL de produção
em `wrangler.jsonc` ou em arquivos locais de desenvolvimento. Para testar
localmente, use valores locais em `.dev.vars`; a rota de teste usa a conta `.dev`
mesmo quando aponta para o script de produção.

## API pública

O Worker definido em [`workers/app/index.ts`](../../workers/app/index.ts) serve
os Static Assets da SPA e processa as rotas `/api/*`.

| Método | Rota                            | Função                                                             |
| ------ | ------------------------------- | ------------------------------------------------------------------ |
| `GET`  | `/api/recycle-points`           | Retorna os campos públicos dos pontos de reciclagem.              |
| `GET`  | `/api/system/settings`         | Retorna se o formulário de adoção está aberto.                    |
| `GET`  | `/api/hero-dog`                 | Retorna o animal em destaque.                                      |
| `GET`  | `/api/dogs`                     | Retorna uma página filtrada do catálogo rotativo armazenado no KV. |
| `GET`  | `/api/dogs/by-slug/:publicSlug` | Retorna o perfil público de um cão pelo slug canônico.             |
| `POST` | `/api/adoption/create`          | Valida e registra uma candidatura de adoção.                       |
| `GET`  | `/api/tests/email`              | Testa o envio para e-mail de debug apenas em desenvolvimento.      |

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

O endpoint `/api/dogs` aceita `page`, `limit`, `cateIdade`, `cor`, `tag` e uma
`version` opcional. A versão mantém a ordem estável entre páginas; versões
anteriores permanecem disponíveis temporariamente para sessões em andamento.

O comportamento da limpeza é definido por `ADOPTION_CLEANUP_MODE`:

| Valor      | Comportamento                                             |
| ---------- | --------------------------------------------------------- |
| `disabled` | Não consulta nem remove candidaturas.                     |
| `dry-run`  | Registra nos logs os documentos elegíveis sem removê-los. |
| `delete`   | Remove os documentos elegíveis.                           |

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
