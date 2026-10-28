# Publicação segura do painel administrativo

Roteiro para publicar o painel atrás do Cloudflare Access e aplicar as regras
finais do Firestore. A arquitetura e a API estão resumidas no
[`README` do painel](../../apps/admin/README.md).

## Pré-requisitos

O Access deve exigir MFA, negar acesso por padrão e permitir apenas os e-mails
configurados no Worker. Não versione identidades ou secrets.

| Papel | Lista no runtime | Escopo |
| --- | --- | --- |
| `developer` | `ADMIN_DEVELOPER_EMAILS` | Administração e manutenção técnica. |
| `administrator` | `ADMIN_ADMINISTRATOR_EMAILS` | Animais, reciclagem, candidaturas e métricas. |

Configure como valores de runtime:

```text
CF_ACCESS_TEAM_DOMAIN
CF_ACCESS_AUD
ADMIN_DEVELOPER_EMAILS
ADMIN_ADMINISTRATOR_EMAILS
CLOUDINARY_CLOUD_NAME
```

Configure como secrets:

```text
FIREBASE_PROJECT_ID
FIREBASE_CLIENT_EMAIL
FIREBASE_PRIVATE_KEY
MASTER_KEY
CLOUDINARY_API_KEY
CLOUDINARY_API_SECRET
```

Use `apps/admin/.dev.vars` somente no ambiente local. Em produção, não coloque
secrets em `wrangler.jsonc` nem em variáveis `VITE_*`.

## Checklist de publicação

1. Execute as verificações abaixo e confirme que o secret scan está limpo.
2. Configure o Worker, o hostname e a aplicação Access antes de divulgar o
   endereço.
3. Publique o painel com `npm run deploy:admin` e valide `/api/session` e os
   CRUDs com uma identidade de cada papel. Confirme também a negação para uma
   identidade externa.
4. Com o Worker operacional, publique as Firestore Rules finais. Elas devem
   permitir ao cliente apenas a leitura de `dogs`, `recycle_points` e
   `system/settings`; todo o restante permanece negado. A conta de serviço dos
   Workers é autorizada por IAM, não pelas Rules.
5. Inicie o cron com `ADOPTION_CLEANUP_MODE=dry-run`. Revise `matched`, `deleted`
   e `hasMore` nos logs e faça o backup necessário; o dry-run não exclui dados.
6. Após conferir as candidaturas vencidas, altere o modo para `delete`. Ausência
   ou valor inválido mantém o cron em `disabled`.
7. Para limpar cães arquivados após 30 dias, configure `DOG_PURGE_MODE=dry-run`,
   confira `matched`, `deleted` e `hasMore` e, após revisar o resultado, altere
   para `delete`. O padrão também é `disabled`. A tarefa remove documentos do
   Firestore; imagens no Cloudinary permanecem.

Os comandos de verificação e o CI não fazem deploy automaticamente.

## Verificação antes do push

```bash
npm ci
npm run check:secrets
npm audit --omit=dev --audit-level=high
npm run lint
npm run build
npm run typecheck:worker
npm run typecheck:admin-worker
npm run test:unit
npm run test:frontend
npm run test:worker
npm run test:rules
npm run check:public-worker
npm run check:admin-worker
npm run check:cron
```

O CI repete essas verificações e executa o Gitleaks sobre todo o histórico.
