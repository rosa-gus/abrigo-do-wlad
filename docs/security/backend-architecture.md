# Arquitetura do backend

Os Workers público, administrativo e cron continuam sendo os pontos de entrada. Contratos, regras puras e integrações estão em pacotes compartilhados, sem dependência dos pacotes para os aplicativos.

```text
apps/public/src ───────┐
apps/admin/src ────────┴──> packages/contracts

Workers/composition ─────> backend/application ──> backend/ports
         │                         │
         └──> backend/adapters     ├──> domain ──> contracts
                  │                └────────────> contracts
                  └── implementam as portas
```

## Responsabilidades

- `packages/contracts/src`: schemas Zod e DTOs separados por recurso, contratos públicos e administrativos, erros e metadados. Não contém credenciais, persistência, React ou APIs de Workers. O contrato do formulário e a ação de reCAPTCHA são compartilhados sem importar a página da interface.
- `packages/domain/src`: retenção e transições de candidaturas, arquivamento de cães, publicação, versões persistidas e capacidades administrativas. Não realiza I/O nem recebe `Env`.
- `packages/backend/src/application`: casos de uso administrativos por recurso. Recebem portas pequenas, horário e IDs; não importam adaptadores, HTTP ou bindings. Projetam campos explicitamente em listas e detalhes.
- `packages/backend/src/ports`: documentos versionados e interfaces por capacidade. Não expõem o cliente REST nem referências a Firestore no serviço de aplicação.
- `packages/backend/src/adapters`: Firestore REST, KV, criptografia, Cloudinary, auditoria e protocolos existentes de projeção, retenção e formulário. Os protocolos compartilhados foram preservados para evitar uma reescrita simultânea de integrações.
- `packages/backend/src/http`: limites de corpo, leitura e respostas, validação de requisições e adaptação de `If-Match`/ETag.
- `apps/admin/worker/routes`: handlers por recurso e registro exato de caminhos, métodos, capacidades e auditoria. Autenticação Access permanece no entrypoint.
- Cada Worker monta suas dependências em `composition.ts`. Dependências e clientes associados à identidade são criados por requisição; não há estado global de usuário.

## Garantias de escrita

Firestore continua sendo a fonte de verdade. Os adaptadores administrativos recebem o cliente auditado da requisição. Dados de negócio, referências de mídia, contadores aplicáveis, evento de auditoria e outbox são incluídos no mesmo commit protegido por versão; as portas não autorizam separar essas garantias em escritas independentes.

Atualizações em KV, destaque e tombstones são projeções recuperáveis. A execução imediata pode acelerar a publicação, mas não substitui a outbox durável nem serve como trava. A origem continua verificando a visibilidade dos cães.

Revisões preservam a precisão do Firestore. A camada HTTP exige uma revisão observada; a aplicação compara a revisão e o adaptador aplica a mesma precondição na escrita. Retenção é verificada antes da descriptografia e novamente após I/O.

## Compatibilidade

Os módulos antigos em `workers/shared` e os antigos módulos de infraestrutura administrativos são fachadas de reexport. Mantêm a identidade das classes e das funções para consumidores existentes e testes de caracterização; a implementação canônica reside nos pacotes. Novos imports devem apontar para o módulo canônico.

Os exports dos pacotes são separados por módulo. O frontend de produção importa contratos seguros; mocks de desenvolvimento podem importar regras puras de `domain`, mantendo a mesma política de retenção/publicação sem incluir adaptadores.

Esta extração não muda formatos criptográficos, IDs ou slugs públicos, política de retenção, integração do formulário ou recursos de infraestrutura. Não exige migração de dados.

## Verificação das fronteiras

`npm run check:architecture` verifica o grafo de imports, inclusive reexports e imports dinâmicos literais. Impede dependências invertidas, imports de servidor pelo frontend (também transitivos), referências de runtime nas camadas puras e ciclos de execução. Cada import entre workspaces deve estar declarado no manifesto do consumidor, evitando depender acidentalmente do hoisting. Imports de tipos também respeitam as fronteiras; ciclos apagados de tipos não são ciclos de execução.

`npm run test:backend` executa regressões administrativas, protocolos compartilhados e testes das novas camadas, sem os testes de frontend. Os checks de tipos dos Workers continuam separados. Build e testes completos de frontend permanecem no GitHub Actions.

`packages/backend/tsconfig.json` também pertence à solução TypeScript da raiz e
carrega os tipos gerados do Worker administrativo para verificar o conjunto de
adaptadores, inclusive mídia. Isso dá ao editor um projeto explícito para os
arquivos do pacote e resolve os globais `Env`, `Fetcher` e `RateLimit` sem copiar
declarações ou misturar os três arquivos gerados. Cada Worker continua sendo
verificado com seus próprios bindings. `npm run typecheck:backend`, também no CI,
verifica o pacote completo mesmo quando um módulo ainda não é importado pelos
entrypoints.

As verificações de imports não substituem a inspeção do bundle gerado e os dry-runs dos Workers no CI. Access/IAM, isolamento dos ambientes, TTL, recuperação e demais verificações operacionais continuam dependendo de evidências do ambiente publicado.
