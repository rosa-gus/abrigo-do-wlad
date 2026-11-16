# Auditoria das APIs e plano de arquitetura em TypeScript

Data: 16/11/2026. Escopo: APIs do repositório, com prioridade para o painel administrativo. Este documento registra os achados da auditoria, o estado das correções e o plano de evolução da arquitetura. As evidências originais descrevem o código anterior às correções; o campo **Status** identifica os achados implementados.

## 1. Escopo, método e limites

Foram examinados os entrypoints público, administrativo e cron; autenticação Access; roteamento e autorização administrativa; CRUD de cães e pontos de reciclagem; leitura e decisões sobre candidaturas; mídia; chaves; avisos; auditoria; acesso REST ao Firestore; publicação, feed e perfis públicos; retenção; serviço e mecanismos centrais de migração; configurações Wrangler, Rules, CI e testes relevantes.

Fora do escopo: implementação do webhook, destino e entrega de notificações do formulário. A referência ao schema do formulário identifica apenas acoplamento arquitetural.

Método: análise estática, testes unitários, testes no runtime Workers e verificação de concorrência no emulador Firestore. A validação em emulador não substitui testes operacionais de implantação ou pentest externo.

As conclusões não certificam a segurança da produção. MFA, políticas Access, IAM, isolamento efetivo de recursos, configuração de cache no edge e recuperação de backups precisam de evidência operacional separada. Não foi confirmado um bypass de autenticação ou uma execução remota de código no escopo inspecionado.

Prioridades: **P1** = integridade/privacidade a tratar primeiro; **P2** = robustez e manutenção na sequência; **P3** = organização e endurecimento incremental. Prioridade é ordem de trabalho, não uma pontuação CVSS. Os problemas administrativos pressupõem uma identidade autorizada; não demonstram acesso anônimo.

## 2. Controles existentes que devem ser preservados

- `apps/admin/worker/access.ts`: validação criptográfica por `jose`, JWKS da equipe, issuer e audience configurados; identidade por e-mail permitido e papéis `administrator`/`developer`; configurações ausentes negam acesso.
- `apps/admin/worker/index.ts`: autenticação antes de servir API ou assets. A configuração administrativa usa `run_worker_first: true`.
- `apps/admin/worker/admin-api.ts`: comparação exata de Origin nas mutações; restrições de papel no servidor para chaves, migrações, avisos e consulta da auditoria; schemas de entrada; respostas JSON sem cache.
- Edições de cães e reciclagem usam precondição Firestore da versão lida. Arquivamento pode atualizar documento e contador atomicamente. Exclusão de rascunhos e limpeza em lote possuem controles de versão.
- A API pública seleciona campos explicitamente; feed e destaque verificam publicação/arquivamento na origem, protegendo a retirada de rascunhos mesmo com cache antigo.
- Chaves são retornadas apenas como metadados; rotação usa aleatoriedade criptográfica, precondição e repetição limitada em conflitos.
- Upload exige identidade, origem e limite por usuário; verifica tipo, assinatura, dimensões e retorno do Cloudinary; restringe exclusão à pasta administrada.
- Assets administrativos têm CSP e outros cabeçalhos; API administrativa usa `no-store`; logs e traces estão configurados no admin.
- Migrações são exclusivas de developer, verificam projeto/release e usam lote, checkpoint e lease com commit atômico no runner.
- Rules negam acesso de clientes a coleções administrativas; CI inclui secret scanning, dependências, lint, build, tipos e testes.

### Matriz das APIs na auditoria inicial

Todas as rotas abaixo passam pela autenticação do entrypoint; mutações exigem Origin igual ao da requisição. `Ambos` significa administrator e developer. A tabela registra o estado anterior às correções e não comprova políticas aplicadas no dashboard Access. O estado de A01–A04 está indicado na seção de achados.

| Recurso | Métodos e caminhos | Papel atual | Observação da auditoria |
| --- | --- | --- | --- |
| Sessão | GET `/api/session` | Ambos | Retorna e-mail e papel; não acessa Firestore. |
| Dashboard | GET `/api/admin/dashboard` | Ambos | Consultas amplas e descriptografia para alertas; falha assíncrona fora do catch local. |
| Candidaturas | GET `/api/admin/adoptions` e `/api/admin/adoptions/:id` | Ambos | Resumo/detalhe sem corte de vencimento e sem auditoria de leitura. |
| Decisão | PATCH `/api/admin/adoptions/:id/status` | Ambos | Regra de retenção e precondição da leitura do servidor; sem revisão obrigatória do cliente. |
| Cães | GET/POST `/api/admin/dogs`; GET/PATCH/DELETE `/api/admin/dogs/:id` | Ambos | DELETE restrito a rascunho não arquivado; ID numérico pode colidir; revisão do cliente opcional no PATCH. |
| Arquivo | POST `/api/admin/dogs/:id/archive` e `/restore` | Ambos | Contador protegido no banco; sincronização de KV em etapas. |
| Reciclagem | GET/POST `/api/admin/recycle-points`; GET/PATCH/DELETE `/:id` | Ambos | DELETE sem precondição; revisão do cliente opcional no PATCH. |
| Disponibilidade | GET/PATCH `/api/admin/system/settings` | Ambos | Decisão de negócio acessível a administrator; preservada no plano. |
| Mídia | POST `/api/admin/media/upload` e `/delete` | Ambos | Upload limitado por identidade; exclusão disputa com vinculação. |
| Avisos | GET `/api/admin/notifications` | Ambos | Vencimento aplicado na leitura. |
| Avisos | PUT/DELETE `/api/admin/notifications` | Developer | DELETE sem precondição. |
| Chaves | GET `/api/admin/system-keys`; POST `/rotate` | Developer | Metadados sem chave; rotação protegida por revisão e retry limitado. |
| Auditoria | GET `/api/admin/audit-log` | Developer | Consulta limitada aos últimos 100 eventos; sem cursor. |
| Migrações | GET `/api/admin/migrations`; POST `/plan` e `/apply` | Developer | Projeto/release, cursor, lease e checkpoint; plano não deve enfraquecer esses controles. |

As referências abreviadas `/rotate`, `/plan`, `/apply` e `/:id` nesta tabela são relativas ao recurso da mesma linha, não aliases adicionais propostos.

## 3. Achados e correções propostas

### A01 — P1: exclusão de mídia disputa com vinculação simultânea

**Status: implementado.** `media-assets.ts` coordena cão e referências por commit atômico, com estados `ready/deleting/deleted`. A exclusão inventaria fotos legadas e retidas antes de bloquear novas vinculações; falhas externas deixam a operação retomável. Os dois ordenamentos da disputa são cobertos por testes no emulador Firestore. Contrato, compatibilidade e restrições de implantação: [registro de mídia](media-registry.md).

Evidência original: `apps/admin/worker/admin-api.ts:814`, especialmente a leitura de todos os cães em `:825`, seguida de exclusão externa. O PATCH de cães aceita fotos sem consultar um estado transacional do asset; `apps/admin/shared/entities.ts` aceita URLs HTTPS.

Cenário: A verifica que uma imagem não está vinculada; B salva uma ficha referenciando a mesma imagem; A exclui no Cloudinary. A referência salva fica quebrada. A consulta prévia é uma proteção útil, mas não elimina essa janela.

Correção proposta: criar registro `media_assets/{assetId}` com `publicId`, URL canônica e estado `ready | deleting | deleted`. Salvar/remover referências e conferir o estado do asset na mesma transação/commit protegido do Firestore. A exclusão só pode marcar `deleting` quando não houver referências; vinculações devem rejeitar esse estado. Depois executar a exclusão no Cloudinary e concluir `deleted`. Uma falha deixa uma operação retomável; não deve reabrir o asset automaticamente sem reconciliação.

Aceite: teste concorrente coordenado entre vinculação e exclusão; apenas uma transição vence. Repetição de exclusão é segura. Falha externa é retomável. Imagens legadas são inventariadas antes de tornar obrigatório um asset gerenciado. URLs externas legadas não são apagadas nem bloqueadas silenciosamente.

### A02 — P1: identificador administrativo de cão pode colidir

**Status: implementado.** Novas fichas usam o ID aleatório do documento, e o painel utiliza rotas `doc:<documentId>`. A busca numérica legada consulta até dois resultados e rejeita ambiguidades com 409. O inventário exclusivo de developer identifica duplicidades sem alterar dados. IDs e slugs públicos são preservados. Contrato e inventário: [identidade administrativa de cães](admin-dog-identities.md).

Evidência original: `apps/admin/worker/admin-api.ts:446` usa `Date.now()`; o documento Firestore recebe ID aleatório, mas a rota busca pelo campo numérico `id` com `findFirstDocumentByField`.

Cenário: dois cadastros no mesmo milissegundo criam documentos diferentes com o mesmo ID de negócio. A rota de detalhe/edição pode selecionar apenas um deles. Não é sobrescrita automática na criação; o problema é ambiguidade posterior.

Correção proposta: adotar o ID do documento como identificador canônico das novas rotas e contratos; manter adaptação temporária das rotas numéricas legadas. Não alterar IDs públicos e slugs existentes. Antes da transição, inventariar duplicidades do campo numérico e resolver casos ambíguos explicitamente. Se compatibilidade numérica for indispensável, usar alocação transacional com unicidade, não um timestamp simples.

Aceite: duas criações com relógio fixo geram identidades distintas e editáveis; IDs e slugs existentes continuam válidos; ambiguidade legada produz conflito explícito, nunca seleção arbitrária.

### A03 — P1: proteção contra edição obsoleta é incompleta

**Status: implementado.** `revision.ts` exige a revisão observada em `If-Match`, preserva a precisão do Firestore e retorna 428 para ausência ou 412 para divergência. As escritas e exclusões usam a mesma revisão como precondição no commit. O contrato alcança cães, reciclagem, decisões de candidaturas, settings, avisos e rotação de chaves; o painel oferece recarregar e revisar sem repetir a mutação automaticamente.

Contrato de compatibilidade: PATCH de cães e reciclagem aceita temporariamente `expectedUpdateTime` apenas quando o header está ausente. A ausência real de singleton usa ETag `"absent"`; aviso vencido retorna `null`, mas conserva a revisão do documento persistido. Respostas de escrita retornam a revisão da própria operação, sem reler uma versão potencialmente alterada por outra requisição.

Repetição de comandos: arquivar, restaurar e rotacionar exigem uma revisão observada; se a primeira execução alterar o recurso, a mesma revisão é recusada na repetição. Rotação com revisão explícita não repete automaticamente após conflito. Exclusão de mídia segue a máquina de estados retomável de A01. Resposta perdida exige nova leitura e verificação do resultado antes de outra ação.

Evidência original: `admin-api.ts:472` e `:607` aceitam ausência de `expectedUpdateTime`. Os DELETE de reciclagem (`:617`) e aviso (`notifications.ts:108`) não condicionam a exclusão à revisão. Status, settings, arquivamento e restauração usam a versão lida pelo servidor, mas não exigem a revisão que o usuário viu.

Impacto: precondição da leitura do servidor evita uma corrida entre leitura e escrita; ela não detecta uma tela antiga que envia uma alteração depois de outra pessoa já ter salvo. Na exclusão sem precondição, uma edição posterior à leitura pode ser apagada.

Correção proposta: exigir revisão do cliente para alterações e exclusões de recursos versionados, via `If-Match` com ETag opaco. Validar contra a revisão atual e aplicar precondição no commit. Usar `428` quando faltar a precondição e `412` quando divergir; manter adaptador temporário para o campo atual. Definir separadamente idempotência de comandos, inclusive arquivar/restaurar e rotação de chaves. Não inferir revisão apenas por horário do navegador.

Aceite: cliente A lê, B altera, A tenta editar/excluir e recebe conflito sem perda de dados. A mesma proteção alcança status, avisos e settings. A interface oferece recarregar e revisar, sem repetir automaticamente uma decisão humana.

### A04 — P1: leituras de candidaturas não aplicam o vencimento

**Status: implementado.** `adoption-access.ts` rejeita datas inválidas e vencidas antes da descriptografia e confere novamente o prazo após I/O. Listagem e contagem usam filtro temporal no Firestore; detalhe indisponível retorna 404. Cada abertura da ficha consulta a API novamente, sem reutilizar cache de dados pessoais. A limpeza mantém as precondições de versão e emite diagnóstico agregado de atraso superior a 24 horas. Política e monitoramento: [retenção de candidaturas](adoption-retention-policy.md).

Evidência original: `admin-api.ts:358` lista sem filtro de `expiresAt`; `:379` devolve detalhe sem esse filtro. `adoption-retention.ts` bloqueia alteração vencida, enquanto a remoção física depende do cron diário e da conclusão dos lotes.

Impacto: uma candidatura cujo prazo já passou pode continuar sendo lida e descriptografada até a limpeza. Isso não comprova descumprimento legal; revela que indisponibilidade para leitura e exclusão física são hoje políticas diferentes e implícitas.

Correção proposta: tornar explícita a política de acesso após `expiresAt`. Recomendação: omitir vencidas da listagem e negar detalhe antes de descriptografar; manter limpeza física com métricas de atraso, backlog e alerta. Filtrar na consulta e validar novamente na camada de aplicação; documentos legados com data inválida seguem fluxo de diagnóstico restrito e sem exposição automática de dados pessoais.

Aceite: exatamente no vencimento, resumo e detalhe não expõem a candidatura; cron indisponível não reabre acesso; limpeza continua idempotente e condicionada à versão; alertar quando houver vencidas persistidas além da tolerância operacional definida.

### A05 — P2: paginação interna lê coleções inteiras

Evidência: `firestore.ts:517` percorre páginas até esgotar a consulta quando não há limite total. Listagens de cães, pontos e candidaturas, dashboard e verificação de referências de imagem não passam limite. `serializeAdoptions` (`admin-api.ts:330`) descriptografa os registros antes de reduzir ao resumo.

Impacto: consumo de memória, chamadas e latência cresce com toda a coleção; uma chave/payload inválido pode derrubar uma listagem completa. A paginação interna de 500 documentos não é paginação da API. O resumo retorna poucos campos, mas o servidor processa muito mais informação sensível.

Correção proposta: consultas por cursor e ordenação estável, páginas padrão de 25 e teto inicial de 100, filtros validados e `nextCursor`; contagens/agregações para métricas. Resumo com DTO explícito e descriptografia restrita aos itens da página. Evitar introduzir nome/telefone em texto aberto só para acelerar a lista; se necessário, adotar projeção criptografada mínima após avaliação do custo de migração. Erros de registro devem ser observáveis e ter tratamento explícito, sem expor plaintext nem omitir falhas silenciosamente.

Aceite: com mais de 500 registros, uma página faz trabalho limitado e não percorre a coleção inteira. Todos os itens são navegáveis sem duplicar/perder itens com a ordenação escolhida. Campos não previstos não aparecem na resposta.

### A06 — P2: limite JSON do admin é aplicado depois do buffering

Evidência: `admin-api.ts:103` verifica Content-Length quando disponível, mas usa `request.text()` antes de medir os bytes efetivos. O limite anunciado é 256 KiB. Upload usa `formData()` após conferir tamanho declarado.

Impacto: no JSON sem comprimento declarado, o aplicativo pode consumir corpo acima do limite antes de rejeitar. O painel exige autenticação, o que reduz a exposição. No multipart há controle prévio e limite de arquivo; validar os bytes recebidos continua sendo defesa adicional, não um bypass remoto confirmado do transporte Cloudflare.

Correção proposta: leitor compartilhado de bytes com limite durante o consumo do stream e cancelamento ao exceder; adaptar a rotina já existente em `workers/shared/api/_lib/validation.ts`. Usar parser distinto por tipo de corpo; manter limites maiores apenas para upload. Verificar se o multipart precisa de stream limitado antes do parser, considerando memória e formato.

Aceite: JSON chunked/sem Content-Length acima do teto recebe 413 antes de ser todo armazenado; limite é em bytes UTF-8; corpo inválido recebe 400; multipart válido preserva limites e validações atuais.

### A07 — P2: auditoria parcial e sem persistência garantida

Evidência: `describeAuditedMutation` (`admin-api.ts:196`) registra apenas mutações reconhecidas. `scheduleAuditRecord` (`:274`) grava separadamente, normalmente por `waitUntil`, e transforma falha em log. Não há evento de leitura de candidatura. Logs de negação do Access são separados.

Impacto: não há trilha persistida de quem abriu dados pessoais; uma mutação pode ter sucesso sem evento durável. Isso é uma lacuna de rastreabilidade, não evidência de vazamento.

Correção proposta: definir matriz de eventos: detalhe sensível, decisões, exclusões, chaves e migrações. Registrar ator por subject e papel, ID do alvo, request ID, resultado e horário; nunca conteúdo do formulário, token ou chave. Para mutações Firestore críticas, gravar alteração e evento/outbox no mesmo commit; tarefas externas usam comando durável com estado. Para leituras sensíveis, decidir explicitamente se falha de auditoria deve negar acesso; recomendação inicial: exigir registro de acesso antes de liberar o detalhe, registrando-o como acesso autorizado, não como prova de entrega ao navegador. Definir retenção e acesso da própria auditoria.

Aceite: falha de persistência não perde silenciosamente evento crítico; entrega repetida não duplica o evento lógico; leitura sensível é rastreável; eventos de falha não carregam PII do payload.

### A08 — P2: publicação assíncrona sem recuperação durável e versão de feed mutável

Evidência: `scheduleDogFeedUpdate` (`admin-api.ts:396`) registra falhas sem criar trabalho persistido. Arquivar/restaurar atualiza Firestore e KV em etapas. Em `dogs/feed.ts:236`, a versão é apenas a data; `:262` sobrescreve a mesma cópia versionada em toda atualização do dia.

Impacto: banco pode ser atualizado enquanto feed/tombstone fica pendente. Uma resposta de erro posterior ao commit pode induzir repetição da operação. Duas reconstruções podem terminar fora da ordem e a paginação com uma mesma versão pode mudar entre páginas. O cron ajuda a recompor, mas não estabelece garantia por operação. A rechecagem atual de publicação na origem é uma proteção que deve permanecer.

Correção proposta: manter no Firestore uma operação/outbox atômica com a mutação; processador com tentativa, backoff, estado e reconciliação. Começar com processamento em lotes pelo cron existente, preservando atualização imediata como otimização; avaliar Queue se a latência exigida justificar. Identidade do snapshot deve incluir revisão única imutável, separada da semente diária de embaralhamento. Ordenar a publicação com lease/revisão autoritativa e não tratar KV como mecanismo de exclusão mútua. Contrato HTTP deve distinguir gravação confirmada de publicação pendente.

Aceite: simular KV indisponível depois do commit, reiniciar o processamento e alcançar estado consistente sem repetir contadores. Duas reconstruções invertidas não promovem snapshot obsoleto como atual. O mesmo snapshot não é sobrescrito. Definir como retiradas imediatas interagem com a paginação: segurança de visibilidade prevalece sobre estabilidade da lista.

### A09 — P2: timeout de mídia e tratamento de erros não são uniformes

Evidência: `cloudinary.ts:316` e `:464` fazem fetch e leitura de resposta sem o helper de timeout existente. Em `routeAdminApi`, `return handleDashboard(...)` retorna uma Promise sem `await` dentro do try; rejeições assíncronas desse caminho escapam do catch local. O entrypoint também retorna a Promise da API sem uma barreira final de erro operacional.

Impacto: operações de mídia podem durar além do orçamento desejado; falha no dashboard pode sair sem o contrato JSON e sem o log padronizado da API. Timeout após upload/exclusão não prova que o provedor não executou a operação.

Correção proposta: deadline por chamada externa incluindo corpo da resposta; tradução de timeout para 504/503 conforme contrato; barreira final de erro com request ID. Usar `return await` onde o catch precisa tratar rejeições. Para Cloudinary, usar identificador de operação persistido e reconciliação antes de repetir uma operação de resultado desconhecido.

Aceite: dashboard rejeitando uma consulta retorna JSON e request ID; Cloudinary travado aborta dentro do orçamento; upload com resposta perdida não gera automaticamente outro asset órfão.

### A10 — P2: lacunas na validação de segurança em runtime

Evidência: `access.test.ts` injeta `verifyJwt`, validando principalmente o mapeamento/autorização. `vitest.worker.config.ts` inclui apenas `workers/**/*.worker.test.ts`, sem suíte runtime de `apps/admin/worker`. A cobertura configurada também exclui o Worker administrativo.

Correção proposta: suíte administrativa em workerd com bindings sintéticos e sem serviços remotos. Testar o verificador real com chaves/JWKS sintéticos controlados: assinatura inválida, audience/issuer incorretos, token expirado, sem identidade e usuário fora das listas. Declarar claims obrigatórios e algoritmo permitido conforme o contrato Access; a ausência dessa declaração não é, por si, bypass de assinatura. Cobrir matriz de papéis por endpoint e não apenas botões. Incluir admin nas métricas de cobertura, sem perseguir percentual artificial.

Aceite: testes de ponta a ponta do handler negam tokens inválidos antes de Firestore/Cloudinary/ASSETS; administrator recebe 403 em toda operação técnica; mutação cross-origin é rejeitada; entrypoint local não entra no bundle de produção.

### A11 — P3: fronteiras arquiteturais e roteamento frágeis

Evidência: `admin-api.ts` concentra HTTP, persistência, autorização, regras e tarefas externas em mais de 900 linhas. O backend do formulário importa schema de uma página do frontend. O domínio administrativo importa código em `workers/shared/api`. Rotas dinâmicas comparam `segments[2]` sem exigir sempre os prefixos completos, podendo aceitar aliases como `/api/outro/dogs` depois da autenticação.

Impacto: alterações têm efeitos difíceis de isolar; contratos e regras podem divergir; aliases aumentam a superfície de manutenção e podem confundir métricas/políticas futuras por path. Os aliases observados não removem a autenticação do entrypoint.

Correção proposta: extrair contratos e domínio, criar módulos por recurso e rotas exatas; centralizar políticas explícitas e dependências por módulo. Extrair de forma incremental e preservar comportamento por testes de caracterização. Manter composição pequena; não introduzir framework de DI nem microserviços por coleção.

Aceite: rota desconhecida retorna 404, método conhecido incorreto retorna 405; matriz de permissões vem de uma fonte; backend não depende de `apps/*/src`; nenhuma importação circular ou secret em bundle de frontend.

## 4. Verificações operacionais pendentes

1. **Access:** comprovar MFA, política de negação padrão, usuários/grupos permitidos, tempo de sessão, AUD/issuer corretos, hostnames alternativos e proteção do hostname efetivamente publicado. O código local não comprova a configuração aplicada.
2. **IAM:** inventariar contas de serviço de público/admin/cron, permissões e chaves ativas. Rules restritivas não limitam a conta de serviço OAuth; essa fronteira é IAM. Separar identidades e remover permissões desnecessárias. Se for necessária segregação por coleção, validar as capacidades reais de IAM e considerar separação de banco/projeto; não prometer isolamento por coleção apenas com papéis distintos no Worker.
3. **Ambientes:** os arquivos Wrangler local e produção apontam para o mesmo ID de namespace KV. Sem ativar bindings remotos isso não prova compartilhamento de dados reais no desenvolvimento; configurações que permitam acesso remoto precisam de namespace próprio e verificação automática de destino.
4. **Chaves:** comprovar entropia da MASTER_KEY, armazenamento, responsáveis pela rotação, recuperação testada e tratamento de comprometimento. Não alterar algoritmo ou formato criptográfico sem fixtures e leitura compatível com os dados existentes.
5. **Observabilidade:** admin possui logs/traces; público mantém `observability.enabled: false` e cron não habilita traces. Definir eventos, amostragem e alertas por serviço, sem capturar PII ou credenciais.
6. **Documentação:** `access-and-rules-rollout.md` ainda menciona leitura direta de `recycle_points`, enquanto as Rules atuais a negam. Corrigir o roteiro para evitar regressão em publicação futura.
7. **Recuperação e retenção:** comprovar restauração, atraso do cron, limites por execução e retenção também de backups e logs. Definir valores com o responsável pelo produto; não inferir uma obrigação jurídica desta auditoria.

## 5. Arquitetura proposta

Manter TypeScript, Firestore, KV, Cloudinary e os três Workers atuais. O objetivo é um backend modular com fronteiras testáveis, mantendo o modelo operacional existente.

```text
apps/public                  apps/admin
     |                            |
Worker público              Worker administrativo
     |                       Access -> políticas -> HTTP
     +-------------+--------------+
                   |
            serviços de aplicação
                   |
       domínio + contratos compartilhados
                   |
      portas de persistência e integrações
                   |
      Firestore / KV / Cloudinary
                   ^
          Worker cron: retenção,
          reconciliação e outbox
```

Estrutura alvo, ajustável à configuração de workspaces atual:

```text
packages/contracts/src/
  dogs.ts, recycle-points.ts, adoptions.ts, admin.ts, errors.ts
packages/domain/src/
  dogs/, adoptions/, publication/, media/
packages/backend/src/
  application/       # casos de uso e políticas
  ports/             # interfaces pequenas por capacidade
  adapters/          # Firestore, KV, Cloudinary, criptografia, auditoria
  http/              # leitura limitada, erros, respostas e revisão
apps/admin/worker/
  index.ts, access.ts, routes/, composition.ts
workers/app/
  index.ts, routes/, composition.ts
workers/cron/
  index.ts, jobs/, composition.ts
```

Regras de dependência:

- `contracts` contém schemas Zod e DTOs públicos/administrativos distintos; não contém credenciais, persistência nem imports de React/Workers.
- `domain` contém transições, invariantes, publicação e retenção; recebe horário/IDs quando necessário e não faz fetch nem conhece Env.
- `backend/application` recebe repositórios e portas específicas, como `AdoptionReader`, `DogRepository`, `MediaRegistry`, `AuditWriter` e `PublicationScheduler`. Evitar interface genérica gigante e excesso de abstrações.
- Adaptadores conhecem Firestore, autenticação de serviço e detalhes de Cloudinary. O adaptador criptográfico preserva formatos e versões existentes.
- Entry points montam dependências por Worker; o frontend importa apenas contratos seguros. Usar exports separados e conferir bundles para evitar inclusão acidental de código/segredos do servidor.
- Políticas por capacidade explícita: administrator opera conteúdo/candidaturas; developer acrescenta manutenção técnica. Não mudar a distribuição atual de poderes sem decisão de produto. Todas as políticas são aplicadas no servidor.
- Firestore é a fonte de verdade. KV é projeção/cache com consistência eventual; operações críticas e checkpoints não dependem de uma escrita KV como prova de exclusão mútua.
- Transações/commits com precondições são necessários para invariantes entre documentos. O cliente REST atual pode ser ampliado apenas nas capacidades necessárias; não é obrigatório trocá-lo por um SDK incompatível com Workers.

Contratos HTTP propostos:

- Respostas de erro estáveis: `{ error: { code, message, requestId } }`; detalhes de validação apenas quando úteis e sem payload sensível.
- Paginação: `{ items, nextCursor }`, tamanho máximo validado e ordenação com desempate por ID. Cursor vinculado à consulta e validado contra projeto/coleção; assinatura só se houver necessidade real de impedir adulteração semântica.
- Leitura individual devolve revisão opaca/ETag; mutações exigem `If-Match`. Não usar horário truncado que perca a precisão do Firestore.
- Idempotência de comandos baseada em registro durável e hash de entrada; reutilizar chave com entrada diferente produz conflito. Rotação e criação merecem atenção a respostas perdidas.
- Separar DTO de resumo, detalhe administrativo e projeção pública. Não retornar documento arbitrário com spread como contrato permanente.
- Preservar compatibilidade de cliente durante transição; atualizar frontend e mocks junto com cada contrato.

## 6. Plano de execução por entregas

### Etapa 0 — Base verificável e decisões operacionais

Entregas: inventário de rotas/métodos/papéis e dependências; evidências Access/IAM; levantamento de duplicidades de IDs, URLs legadas e volumes sem exportar dados pessoais; orçamento de latência e retenção de auditoria. Corrigir documentação divergente. Registrar decisão de arquitetura mantendo TypeScript e três Workers.

Validação: baseline de testes; registro do ambiente alvo; nenhuma escrita em produção para realizar o inventário. O resultado operacional diferencia fatos comprovados de itens ainda não verificados.

### Etapa 1 — Correções pequenas com alto retorno

Atende A03, A04, A06 e A09. Introduzir leitor limitado; timeout Cloudinary; barreira de erro; precondições nas exclusões e contrato de revisão no cliente; restrição de leitura vencida após formalizar a política. Extrair helper reutilizável sem reestruturar todos os módulos.

Validação: testes negativos de corpo e acesso; conflito entre duas telas; dashboard falhando; vencimento com relógio controlado; mídia com timeout. Manter testes atuais. Cada alteração pode ser entregue em PR independente.

### Etapa 2 — Identidade de cães e ciclo de vida da mídia

Atende A01 e A02. Criar registros de assets e mecanismo transacional de referências; inventariar/importar imagens existentes; adicionar ID canônico e compatibilidade das rotas antigas; tornar exclusão retomável. Ativar exigência de asset somente depois do backfill e validação.

Validação: testes de concorrência com interleavings controlados; IDs gerados sob relógio fixo; duplicidades legadas; imagem com resposta perdida; nenhuma mudança de slug público. Requer apoio transacional do adaptador Firestore antes de publicar o novo protocolo.

### Etapa 3 — Contratos, módulos e consultas limitadas

Atende A05 e A11. Criar `packages/contracts` e `packages/domain`; mover primeiro schemas sem mudança semântica; extrair candidaturas, cães, reciclagem e sistema para módulos separados; introduzir repositórios pequenos, DTOs e paginação. Atualizar frontend, mocks e índices Firestore necessários. Extrair contrato do formulário sem alterar sua integração com webhook.

Validação: typecheck dos consumidores, testes de caracterização e navegação entre páginas com mais de 500 itens. Proibir imports de `apps/*/src` no servidor e de adaptadores no frontend. Validar compilação e conteúdo dos bundles.

### Etapa 4 — Auditoria durável e publicação recuperável

Atende A07 e A08. Definir eventos, retenção e visibilidade; adicionar escrita atômica de eventos/outbox às operações críticas; processador cron retomável e reconciliação; snapshots imutáveis do feed e ordenação de publicação. Avaliar Queue apenas se o intervalo aceitável de publicação não puder ser atendido pelo cron/execução imediata com recuperação.

Validação: falha depois de commit, timeout com resultado desconhecido, repetição e execução fora de ordem. Medir idade máxima da outbox, tentativas, falhas permanentes e atraso de publicação. Não transportar plaintext de candidaturas para outbox/logs.

### Etapa 5 — Runtime, rollout e comprovação

Atende A10 e as pendências operacionais. Suíte workerd do admin com credenciais sintéticas; testes reais de JWT com JWKS controlado; matriz completa de permissões; CI por tipos de Worker; separação comprovada de recursos de desenvolvimento; plano de recuperação e alertas.

Validação: executar checks completos do repositório e smoke tests em ambiente isolado, com um usuário de cada papel e uma identidade negada. Usar dados sintéticos nos smoke tests e verificar as políticas do ambiente alvo antes da implantação.

### Sequência e dimensionamento

Ordem proposta: Etapa 0; Etapa 1; Etapa 2; Etapa 3; Etapa 4; Etapa 5. Os testes de regressão de cada achado entram junto com sua correção, não são adiados até a última etapa. Dentro da Etapa 1, revisão/retenção precedem melhorias de ergonomia.

Estimativa preliminar para uma pessoa familiarizada com o projeto: 1–2 dias para Etapa 0; 3–5 para Etapa 1; 4–7 para Etapa 2; 4–7 para Etapa 3; 4–7 para Etapa 4; 2–4 para consolidação da Etapa 5. São 18–32 dias úteis de engenharia, não prazo prometido; dependem de volume legado, acesso operacional e política de retenção. Fracionar em PRs pequenos e reestimar após o inventário.

## 7. Migração e reversibilidade

1. Primeiro adicionar contratos/campos compatíveis e leitura dupla quando necessária; só depois ativar a exigência de novos invariantes.
2. Backfills devem ser em lotes, idempotentes, com preview, checkpoint e precondições, aproveitando o runner existente.
3. Não alterar formato AES-GCM, derivação de chaves, IDs públicos ou política de retenção silenciosamente durante extrações.
4. Manter leitores compatíveis com dados novos durante a janela de rollback. Não fazer rollback para uma versão que ignore o estado `deleting` de mídia após habilitar esse protocolo.
5. Código pode ser revertido dentro da janela compatível; deploy anterior não desfaz dados ou exclusões externas. Backups/restauração e operações compensatórias são planos separados.
6. Promover por etapa: testes locais, staging isolado, observação de métricas, implantação controlada e verificação do resultado.

## 8. Critérios globais de conclusão

- Nenhuma operação administrativa depende apenas de proteção da interface.
- Nenhuma mutação versionada sobrescreve/exclui silenciosamente a revisão vista por outro usuário.
- Candidatura vencida não é descriptografada para usuário comum do painel após o prazo definido.
- Listagens têm custo limitado por requisição e contratos explícitos.
- Exclusão de mídia não pode vencer simultaneamente uma nova vinculação válida.
- Operações críticas têm identidade, idempotência e evento durável; tarefas pendentes são recuperáveis e observáveis.
- Retirada de publicação continua sendo respeitada mesmo com feed antigo.
- Testes administrativos exercitam runtime e verificação criptográfica, além de mocks de autorização.
- Ambiente local não alcança recursos remotos de produção inadvertidamente.
- Extrações de schema preservam o contrato e o comportamento do webhook.

## 9. Validação técnica

| Verificação | Comando | Cobertura |
| --- | --- | --- |
| Contratos e regras de negócio | `npm run test:unit` | Revisões, identidade canônica, expiração, estados de mídia e rotas administrativas. |
| Runtime Workers | `npm run test:worker` | Integração com o runtime e bindings sintéticos. |
| Rules Firestore | `npm run test:rules` | Negação de acesso direto a dados administrativos. |
| Concorrência de mídia | `npm run test:media` | Ambos os ordenamentos de vínculo/exclusão no emulador Firestore, atomicidade e preservação de campos. |
| Tipos | `npm run typecheck:worker` e `npm run typecheck:admin-worker` | Contratos dos Workers e adaptadores. |
| Interface | `npm run test:frontend` | Envio da revisão exibida, tratamento de conflito e nova consulta ao reabrir candidatura. |
| Build | `npm run build` | Compilação dos aplicativos público e administrativo. |
| Empacotamento | `npm run check:public-worker`, `npm run check:admin-worker` e `npm run check:cron` | Dry-run dos três Workers, sem publicação. |
| Análise estática | `npm run lint` e `npm run check:secrets` | Regras de código e detecção de credenciais versionadas. |

Regressões de A01–A04: `apps/admin/worker/p1-admin-api.test.ts`, `media-assets.test.ts`, `media-assets.emulator.test.ts`, `dog-identity.test.ts`, `revision.test.ts`, `key-revision-route.test.ts` e `adoption-access.test.ts`. Os testes opt-in de mídia exigem `FIRESTORE_EMULATOR_HOST` em loopback e são executados pelo comando `test:media` no CI. A preparação do emulador inicializa escrita e consulta antes de exercitar o timeout de produção.

## 10. Referências técnicas consultadas

- [Cloudflare — validar JWT do Access](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/): validação no servidor e audience da aplicação.
- [Firebase — Rules e acesso privilegiado](https://firebase.google.com/docs/firestore/security/insecure-rules): contas de serviço/REST autenticadas por IAM não são limitadas pelas Rules de clientes.
- [Firestore — IAM](https://firebase.google.com/docs/firestore/security/iam): fronteira de acesso privilegiado ao banco.
- [Cloudflare KV — escritas concorrentes](https://developers.cloudflare.com/kv/api/write-key-value-pairs/): KV possui consistência eventual e escritas concorrentes na mesma chave podem sobrescrever-se.
