# Segurança e consistência das APIs

Os Workers público, administrativo e cron acessam o Firestore por conta de
serviço. Firestore é a fonte de verdade; KV contém projeções de leitura com
consistência eventual. O navegador usa as APIs e não recebe credenciais do banco,
chaves de descriptografia ou secrets do Cloudinary.

Esta referência descreve os contratos, invariantes e verificações operacionais
do backend. A organização dos pacotes está na [arquitetura do backend](backend-architecture.md).
Configuração local, rotas e comandos do painel estão no
[README administrativo](../../apps/admin/README.md); o executor de migrações está
em [Migrações do Firestore](../firestore-migrations.md).

## Autenticação e autorização

O [entrypoint administrativo](../../apps/admin/worker/index.ts) autentica APIs e
assets antes de atendê-los. `run_worker_first: true` mantém os assets atrás dessa
barreira; respostas administrativas usam `no-store` e cabeçalhos de segurança.

[access.ts](../../apps/admin/worker/access.ts) valida `Cf-Access-Jwt-Assertion`
com `jose`, JWKS da equipe, algoritmo RS256, issuer `https://<team-domain>` e
audience configurados. Exige `exp`, `iat`, `iss`, `aud`, `sub` e `email`.
Identidade ausente, token inválido ou configuração necessária ausente nega acesso.
Tokens de serviço sem identidade humana não autorizam o painel.

| Papel           | Configuração                 | Capacidades                                                                                       |
| --------------- | ---------------------------- | ------------------------------------------------------------------------------------------------- |
| `administrator` | `ADMIN_ADMINISTRATOR_EMAILS` | Conteúdo, candidaturas, disponibilidade e leitura dos avisos.                                     |
| `developer`     | `ADMIN_DEVELOPER_EMAILS`     | Capacidades administrativas, chaves, migrações, escrita de avisos, auditoria e inventário de IDs. |

E-mails são normalizados; a lista de developer tem precedência quando a identidade
aparece nas duas listas. A autorização ocorre no servidor. Mutações exigem
`Origin` exatamente igual à origem da requisição, além de payload válido.

`CF_ACCESS_TEAM_DOMAIN` e `CF_ACCESS_AUD` definem a aplicação Access.
As credenciais `FIREBASE_*`, `MASTER_KEY` e `CLOUDINARY_API_SECRET` pertencem ao
runtime, nunca a variáveis públicas `VITE_*`. A configuração de MFA e das políticas
do Access é externa ao código. O modo local sem Access usa outro entrypoint e
restrições de desenvolvimento descritas no README do painel.

## Firestore, Rules e identidade dos registros

As [Rules](../../firestore.rules) permitem leitura direta somente de
`system/settings`. Clientes, inclusive autenticados, não podem ler nem escrever
`dogs`, `recycle_points`, candidaturas, chaves ou coleções administrativas.
O acesso privilegiado dos Workers é controlado por IAM; Rules de cliente não
substituem as permissões das contas de serviço.

Novos cães usam o ID aleatório do documento como identidade administrativa.
O contrato contém `documentId` e `revision`; o campo numérico `id` pode existir
nos dados legados. Rotas canônicas usam `doc:<documentId>`, codificado no cliente:
`/api/admin/dogs/doc%3Aa1B2c3`. Rotas numéricas antigas consultam até dois
resultados pelo campo `id` e retornam 409 quando houver ambiguidade.
IDs e slugs públicos têm contrato separado e são preservados.

`GET /api/admin/dog-identity-inventory` retorna IDs duplicados e documentos
correspondentes, sem nomes. Esse inventário e o inventário de referências legadas
de mídia percorrem a coleção inteira: truncá-los poderia ocultar uma ambiguidade
ou liberar uma exclusão incorreta. A redução dessas varreduras depende de um
inventário completo persistido e de referências atualizadas por todos os escritores.

## Revisões e contratos HTTP

Erros administrativos retornam `{ error: { code, message, requestId } }` e o mesmo
identificador em `X-Request-ID`. O cliente preserva esses campos em `ApiError`;
JSON legado continua aceito durante a atualização dos consumidores. A visão geral
exibe a referência para correlacionar a falha com os logs do servidor.

`DATA_QUERY_FAILED` identifica falha de consulta (500), `REVISION_MISMATCH` indica
conflito de escrita (412), `SERVICE_UNAVAILABLE` indica indisponibilidade (503)
e `UPSTREAM_TIMEOUT` indica timeout (504). `FAILED_PRECONDITION` do Firestore só
representa revisão obsoleta quando a operação rejeitada é uma escrita; consulta
sem índice não recebe o contrato de conflito de edição.

O adaptador Firestore extrai código e mensagem de respostas em objeto ou array,
preservando os detalhes na exceção. Logs incluem request ID, RPC, coleção e tipo
de operação. Cada dependência do dashboard tem nome próprio, como
`dashboard.dogs.countArchivedPublished`; falhas concorrentes geram eventos
`admin.dependency.failed` correlacionados, mesmo após a primeira rejeição.
`admin.api.request`, `admin.api.error` e `admin.api.completed` usam o mesmo ID.
Os diagnósticos registrados são limitados a categorias conhecidas, como índice
ausente ou JSON inválido; payloads, stacks e texto arbitrário do provedor não são
copiados para logs ou respostas. `api-errors.ts` centraliza esse contrato.

Leituras individuais de recursos versionados fornecem revisão opaca em `ETag`.
Mutações enviam a revisão observada em `If-Match`, e o commit aplica a mesma
precondição Firestore. [revision.ts](../../apps/admin/worker/revision.ts)
preserva a precisão do timestamp do banco.

| Condição                                 | Resposta        |
| ---------------------------------------- | --------------- |
| Precondição ausente                      | 428             |
| Revisão divergente ou validador inválido | 412             |
| Singleton inexistente                    | ETag `"absent"` |

PATCH de cães e reciclagem ainda aceita `expectedUpdateTime` quando `If-Match`
está ausente. Um aviso vencido pode retornar `null` com a revisão do documento
persistido. O cliente recarrega e revisa a decisão após conflito; não repete
automaticamente uma alteração usando uma revisão recém-obtida.

Arquivar, restaurar e rotacionar chaves também exigem a revisão observada.
Resposta perdida exige consultar o resultado antes de repetir o comando.
Rotação com revisão explícita não repete automaticamente após conflito.

As listagens GET de cães, reciclagem e candidaturas retornam
`{ items, nextCursor }`. `limit` tem padrão 25 e teto 100; uma chamada Firestore
busca até `limit + 1` documentos. Cursores são vinculados ao projeto, coleção,
ordenação e filtros; cursores inválidos retornam 400 e não conferem autorização.

| Recurso      | Ordenação                          | Filtros da API                                                 |
| ------------ | ---------------------------------- | -------------------------------------------------------------- |
| Cães         | ID do documento                    | `state=active\|archived`, `publicationStatus=draft\|published` |
| Reciclagem   | ID do documento                    | `publicationStatus=draft\|published`                           |
| Candidaturas | `expiresAt`, com ID como desempate | `status=pending\|approved\|rejected`                           |

O filtro de arquivo é aplicado à janela limitada para preservar registros sem
`archivedAt`; uma página vazia ainda pode ter `nextCursor`. O painel carrega mais
por ação explícita, e a busca visual considera os registros carregados. Alterar
filtros da consulta exige reiniciar o cursor. Inserções, exclusões, alterações na
ordenação e vencimentos concorrentes não oferecem snapshot da coleção.

DTOs selecionam campos explicitamente. Somente a página de candidaturas é
descriptografada; falhas produzem erro da página e diagnóstico agregado, sem
descartar registros silenciosamente. Métricas usam agregações `count` e o
dashboard limita os alertas às 25 candidaturas com vencimento mais próximo.
Contagens independentes podem refletir instantes diferentes. Os índices compostos
estão em [firestore.indexes.json](../../firestore.indexes.json) e precisam existir
no ambiente que executa essas consultas.

## Retenção e acesso a candidaturas

[adoption-access.ts](../../apps/admin/worker/adoption-access.ts) libera dados
somente quando `expiresAt` é uma data ISO válida estritamente posterior ao relógio
do servidor. A consulta filtra o vencimento no Firestore e a aplicação confere o
prazo antes e depois da descriptografia. No vencimento, a listagem omite o registro
e o detalhe responde 404, independentemente da execução do cron. Cada abertura da
ficha faz nova consulta; o detalhe também depende do registro de auditoria.

A exclusão física ocorre em lotes com precondições de versão e decremento atômico
dos contadores de chaves. A política de 30 dias desde o envio e a janela após
decisão estão em [adoption-retention.ts](../../apps/admin/shared/adoption-retention.ts).
Reconsideração não prorroga a janela já fixada pela primeira decisão.

O cron interpreta `ADOPTION_CLEANUP_MODE` e `DOG_PURGE_MODE` como `delete`,
`dry-run` ou `disabled`; valores ausentes/inválidos desativam a respectiva tarefa.
A configuração de produção habilita a limpeza de candidaturas. Cães arquivados
têm `purgeAfter` calculado para 30 dias, e sua limpeza preserva imagens Cloudinary.

A tolerância de monitoramento da exclusão de candidaturas é 24 horas após o
vencimento, sem ampliar o acesso. `adoption.retention.observed` e
`adoption.retention.overdue` registram contagens e atraso observado;
`admin.adoption.invalid-expiration` registra datas inválidas. Os eventos não
incluem nomes, telefones, IDs de candidaturas, ciphertext ou chaves.
`hasMore` indica trabalho de limpeza ainda pendente.

## Corpos e operações de mídia

O [leitor compartilhado](../../workers/shared/api/_lib/body.ts) limita bytes
durante o consumo do stream e cancela ao exceder. JSON administrativo aceita
até 256 KiB UTF-8; JSON/UTF-8 inválido recebe 400 e excesso recebe 413.
`Content-Length` permite rejeição antecipada, sem substituir a medição efetiva.
Multipart exige comprimento declarado, admite arquivo até 20 MiB e 64 KiB de
overhead e é limitado antes do parser. Tipo, assinatura e dimensões da imagem
também são validados.

Cada chamada Cloudinary tem deadline de 15 segundos, incluindo a leitura de até
64 KiB da resposta JSON. Timeout recebe 504 e não comprova que a operação deixou
de ocorrer. A barreira operacional da API retorna JSON com request ID; falhas
operacionais são tratadas separadamente da negação de autenticação.

### Upload

[media-upload.ts](../../apps/admin/worker/media-upload.ts) usa `Idempotency-Key`
UUID e `media_upload_commands/{sha256(key)}`. Antes da chamada externa, persiste
ator, hash do arquivo, public ID e estado `uploading`, sem conteúdo da imagem ou
segredos. A chave pertence à identidade que iniciou a operação; reutilização
com outro arquivo ou ator recebe 409. O cliente conserva a chave para o mesmo
objeto `File`.

Após resultado desconhecido, uma repetição consulta o public ID persistido.
Imagem válida conclui o comando como `completed`; repetições seguintes retornam
o resultado salvo. Recurso ausente, inválido ou falha de consulta mantém o comando
pendente, sem novo upload automático. O comando não tem expiração automática e
não deve ser removido para forçar repetição enquanto o resultado for desconhecido.
Um segundo perfil de compressão só começa após confirmar a exclusão do primeiro;
o public ID de cada tentativa é persistido antes da chamada.

### Referências e exclusão

[media-assets.ts](../../apps/admin/worker/media-assets.ts) mantém
`media_assets/{sha256(publicId)}`. URLs transformadas do mesmo public ID
compartilham o registro. Cão e referências de mídia são escritos no mesmo commit
com precondições; `fotos` e `retainedPhotos` contam como referências.

A máquina de estados é `ready → deleting → deleted`. Novas vinculações só são
aceitas em `ready`. A exclusão lê a revisão antes de inventariar todas as fichas e
só confirma `deleting` sob essa revisão quando não há referências. Uma vinculação
concorrente altera a revisão ou observa o estado bloqueado; ambas não podem vencer.
`referencedBy` auxilia diagnóstico, mas não substitui o inventário legado.

Destroy ocorre depois do bloqueio persistido. Falhas mantêm `deleting`; repetir
a requisição retoma a operação, e recurso já ausente confirma a exclusão.
`deleted` torna repetições sem efeito. Não há retorno automático a `ready`.
URLs externas ou de pastas não gerenciadas permanecem utilizáveis nas fichas e
não são excluídas pela API. Schemas de cão futuros/inválidos bloqueiam exclusão
porque o escritor não conhece todas as referências possíveis.

Scripts, migrações e versões em execução precisam respeitar o mesmo protocolo.
Uma versão que ignore `deleting` não é compatível com esses registros. Reparos
dependem de reconciliar referências Firestore e estado Cloudinary.

## Auditoria durável

[audit.ts](../../apps/admin/worker/audit.ts) cria um cliente Firestore por
requisição. O callback de commit recebe caminhos, sem payload, e acrescenta
evento à mesma operação `documents:commit`. A precondição rejeita alteração,
evento e outbox conjuntamente. O evento usa o alvo canônico escrito e contém
subject, papel, e-mail do ator, método, caminho, request ID, resultado e horário;
não copia formulário, plaintext, token ou chave.

| Fase         | Significado                                                    |
| ------------ | -------------------------------------------------------------- |
| `committed`  | Alteração e evento persistidos atomicamente.                   |
| `authorized` | Acesso ao detalhe autorizado antes da leitura/descriptografia. |
| `response`   | Resultado HTTP registrado separadamente.                       |

Falha ao persistir `authorized` bloqueia o detalhe. A fase não comprova entrega
ao navegador. Diagnóstico de resposta pode usar `waitUntil`, mas o evento crítico
de commit não depende dele. O protocolo cobre conteúdo, decisões, disponibilidade,
avisos, chaves e transições de mídia. Migrações acrescentam evento aos commits de
checkpoint, preservando trava e revisão. Upload tem comando durável próprio.

Eventos ficam em `admin_audit_log`; consulta é exclusiva de developer e retorna
os últimos 100. Novos eventos recebem `expiresAt` timestamp para 180 dias.
A exclusão depende de política TTL configurada no Firestore e é eventual;
registros antigos sem esse campo não recebem o mesmo prazo automaticamente.

## Publicação recuperável

Commits administrativos em `dogs/*` também criam `publication_outbox/{uuid}`
com ação e caminhos. `X-Publication-State: pending` distingue gravação confirmada
de projeção pendente. Falhas nas otimizações imediatas de tombstone não convertem
uma gravação confirmada em erro da mutação.

[publication-outbox.ts](../../workers/shared/api/dogs/publication-outbox.ts)
processa até 25 trabalhos por execução, imediatamente via `waitUntil` ou pelo cron
diário. Cada claim usa revisão e prazo de 90 segundos; falhas persistem tentativas
e backoff exponencial limitado a uma hora. Claims interrompidos são recuperáveis.
A reconciliação atualiza tombstones, destaque e feed sem repetir contadores.
Mudança da origem durante a projeção devolve o trabalho a pendente. Purge por
retenção preserva tombstone; exclusão explícita de rascunho pode removê-lo.
Trabalhos concluídos não têm limpeza automática.

Sem execução imediata, a recuperação depende do próximo cron e do backlog em
lotes. `dogs.publication.batch` registra processados, falhas, deferimentos,
`oldestDueAgeMs` e `maxAttempts`; erros remotos são persistidos como classificação.

[feed.ts](../../workers/shared/api/dogs/feed.ts) grava snapshots imutáveis em
`dogs-feed:AAAA-MM-DD_UUID`, com retenção de três dias. O embaralhamento usa a
semente diária, separada da identidade do snapshot. Um lease de 60 segundos e
precondição em `system/dog-feed-publication` impedem um construtor que perdeu sua
revisão de promover um snapshot obsoleto.

Leituras sem versão seguem o ponteiro Firestore e exigem exatamente o snapshot
correspondente. `dogs-feed:current` é compatibilidade anterior à inicialização
do ponteiro; não substitui um snapshot autoritativo ausente por outro catálogo.
Versões diárias antigas ainda podem ser lidas. Toda página pública confere
publicação e arquivamento na origem; retiradas podem reduzir ou deslocar itens
de páginas antigas. Leitores que ignorem o ponteiro não são compatíveis com a
ordenação de publicação. IAM precisa permitir esses documentos e coleções aos
Workers envolvidos.

## Dependências e validação

Os overrides do [package.json](../../package.json) também alcançam ferramentas
de desenvolvimento. A tabela registra seu propósito e o teste de compatibilidade;
as versões efetivas estão no lockfile.

| Override                        | Propósito                                                                            | Validação                |
| ------------------------------- | ------------------------------------------------------------------------------------ | ------------------------ |
| `@grpc/grpc-js`                 | Validação de certificados nas dependências Firestore.                                | Emulador e Rules.        |
| Pool de testes → `zod` da raiz  | Unificar a versão de validação usada por aplicação e ferramentas.                    | Unitários e workerd.     |
| Miniflare → `sharp`, `undici`   | Correções das bibliotecas de imagem e HTTP, mantendo o pareamento Miniflare/workerd. | Runtime e empacotamento. |
| Pub/Sub → `@opentelemetry/core` | Correção do parser de baggage, preservando `W3CTraceContextPropagator`.              | Firebase CLI e emulador. |
| Gaxios 6 → `uuid`               | Verificação de limites de buffer com compatibilidade da API CommonJS `v4`.           | Firebase CLI e emulador. |

Cada override pode ser removido quando a dependência de origem declarar uma faixa
compatível que inclua a correção, atualizando o lockfile e repetindo a validação.

`npm run test:unit` cobre revisões, retenção, DTOs, commits e recuperação.
`npm run test:worker` inclui o entrypoint administrativo real no workerd com
chaves/JWKS sintéticos e bloqueio de serviços remotos. `test:rules` valida o
isolamento de clientes; `test:media` usa emulador para os dois ordenamentos da
disputa entre vínculo e exclusão. Tipos, lint, secret scan, build e dry-runs dos
três Workers complementam esses testes; não comprovam políticas Access/IAM,
restauração ou configuração TTL de um ambiente publicado.

Os testes opt-in de concorrência de mídia exigem `FIRESTORE_EMULATOR_HOST` em
loopback e são executados por `npm run test:media` no CI.

O backend separa contratos seguros, domínio puro e aplicação/portas/adaptadores/HTTP
em `packages/contracts`, `packages/domain` e `packages/backend`. Os três Workers
montam suas dependências em `composition.ts`; o administrativo delega a rotas por
recurso. Um registro exato centraliza caminhos, métodos, capacidades, auditoria e
labels de logs. Prefixos alternativos são rejeitados com 404; métodos incorretos
em rotas conhecidas retornam 405 com `Allow`, antes de I/O.

As fachadas antigas em `workers/shared` e nos módulos administrativos preservam
compatibilidade por reexport. `npm run check:architecture`, também no CI, impede
dependências invertidas, ciclos de execução e imports transitivos de servidor no
frontend. A [referência de arquitetura](backend-architecture.md) descreve as portas,
composição lazy por requisição e preservação dos commits de negócio/auditoria/outbox.

## Verificações operacionais de implantação

As migrações concluídas e os testes do código não comprovam a configuração do
ambiente publicado. As verificações abaixo devem ter evidências por ambiente:

- **Access:** MFA, negação padrão, usuários/grupos permitidos, duração de sessão,
  AUD/issuer, hostnames alternativos e proteção do hostname publicado.
- **IAM:** inventário das contas de serviço de público/admin/cron, permissões e
  chaves ativas; separação de identidades e privilégio mínimo. Rules de clientes
  não limitam o acesso OAuth privilegiado. Se houver necessidade de isolamento
  por coleção, verificar as capacidades efetivas de IAM e avaliar separação de
  banco/projeto; papéis diferentes no Worker não comprovam esse isolamento.
- **Ambientes:** as configurações Wrangler local e de produção ainda declaram
  o mesmo ID de namespace KV. Isso não comprova acesso remoto durante o
  desenvolvimento. Antes de permitir bindings remotos, separar namespaces e
  conferir automaticamente o destino das operações.
- **Chaves:** entropia e armazenamento da `MASTER_KEY`, responsáveis pela rotação,
  recuperação testada e resposta a comprometimento. Alterações no algoritmo,
  derivação ou formato criptográfico exigem fixtures e leitura compatível com os
  dados existentes.
- **Observabilidade:** definir eventos, amostragem e alertas por serviço sem PII
  ou credenciais. A configuração administrativa habilita logs/traces; a pública
  mantém `observability.enabled: false`, e o cron não habilita traces.
- **Recuperação e retenção:** validar restauração, atraso do cron, limites por
  execução, TTL e retenção de backups/logs. Prazos e tolerâncias devem ser
  definidos com o responsável pelo produto.
