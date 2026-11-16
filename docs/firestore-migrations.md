# Migrações do Firestore

O executor versiona transformações dos documentos, sem executar migrações
automaticamente nas requisições do site ou no cron. Usa a API REST e a conta de serviço do
ambiente, sempre no banco `(default)`. Não modifica imagens nem outros serviços.

## Executar pelo painel de admin

Em **Opções de desenvolvedor → Migrações de dados**, usuários com papel
`developer` podem consultar o histórico, simular e aplicar/retomar migrações.
O backend também exige esse papel em todas as rotas; administradores não têm
acesso, inclusive ao histórico e à simulação.

1. Confira o ambiente, o projeto Firebase e o banco exibidos no painel.
2. Clique em **Simular migrações** e revise as contagens de alterações previstas.
3. Clique em **Aplicar / retomar** e confirme o destino e as migrações pendentes.
4. Aguarde a conclusão. O painel continua solicitando lotes enquanto estiver aberto.

No painel de produção, o Worker usa os secrets `FIREBASE_PROJECT_ID`,
`FIREBASE_CLIENT_EMAIL` e `FIREBASE_PRIVATE_KEY` já configurados no Cloudflare.
Não é necessário copiar ou regenerar credenciais, nem alterar `.dev.vars.local`.
A conta de serviço precisa ter as permissões IAM de leitura e escrita necessárias.
A publicação do código não inicia migrações automaticamente.

Cada chamada de aplicação processa no máximo um lote de 50 documentos (ou a
passagem de uma coleção vazia), preserva o checkpoint e libera a trava. As
migrações seguintes só avançam após a conclusão das anteriores. A mesma trava
protege contra sobreposição com a CLI. O estado `running` pode representar uma
execução aguardando a próxima chamada; `failed` indica uma falha registrada.
`attempts` conta aquisições para execução/retomada, inclusive chamadas pelo painel.

Fechar a página interrompe a solicitação dos próximos lotes. Uma chamada já
enviada ainda pode confirmar seu commit; reabra, atualize o histórico, simule e
retome. Depois de uma falha ou resposta perdida, vale o checkpoint persistido.
Uma trava abandonada expira automaticamente. Não apague histórico ou travas.

A simulação é paginada e não grava dados, histórico ou trava; suas contagens são
mantidas na página e uma nova simulação reinicia a leitura. O projeto e os
checksums das definições compõem a confirmação de destino. Se o projeto, o ambiente
ou as definições mudarem após a revisão, o backend recusa a chamada e exige uma
nova revisão. A simulação não representa um snapshot do banco.

O histórico registra o desenvolvedor responsável pela aplicação. A auditoria do
admin registra as chamadas de aplicação e seus resultados; os logs do Worker
incluem projeto, migração e contagens, sem credenciais ou documentos.
`--to` e `--rescan` continuam disponíveis somente na CLI nesta etapa.

## Executar pela CLI

As variáveis `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL` e
`FIREBASE_PRIVATE_KEY` vêm do arquivo de runtime. O projeto passado no comando
deve ser exatamente o configurado nesse arquivo.

```bash
node --env-file=<runtime.env> scripts/migrate.mjs status --project=<id>
node --env-file=<runtime.env> scripts/migrate.mjs plan --project=<id>
node --env-file=<runtime.env> scripts/migrate.mjs up --project=<id> --apply
```

`status` consulta o histórico. `plan` percorre os documentos e simula a cadeia
de transformações, sem escrever dados, histórico ou trava. `up --apply` aplica
as migrações em ordem ou retoma as interrompidas. Também existe o atalho
`npm run db:migrate -- <comando> ...` quando as variáveis já estão no ambiente.

`plan` e `up` aceitam `--to=0001-publication-status` para limitar a execução.
`--batch-size=50` reduz o lote padrão de 100 documentos. Para reexaminar desde o
início, inclusive migrações concluídas, use `up --apply --rescan`. Isso cobre
documentos legados inseridos antes de um cursor já processado. Documentos cuja
versão já atingiu o destino não são transformados novamente.

O plano é uma simulação, não um snapshot nem uma reserva dos dados. Alterações
feitas depois dele são conferidas novamente durante a execução. Logs mostram
projeto, IDs das migrações e contagens, sem copiar documentos ou credenciais.

## Versões e recuperação

- `_migrations/{id}` registra checksum SHA-256, estado (`running`, `failed` ou
  `completed`), tentativa, conta de serviço, datas, contagens e cursor por coleção.
  Uma migração ainda ausente tem estado virtual `pending`.
- `schemaVersion` é a versão do documento de uma coleção. Ausência representa o
  legado v0. É independente das versões de payloads da API ou caches no KV.
  As versões atuais dos escritores estão em `workers/shared/document-schema.ts`.
- `_migration_locks/firestore` impede dois executores de escrever simultaneamente.
  A concessão dura dois minutos e é renovada a cada lote. Quem perde a trava ou
  excede o prazo não pode confirmar o lote seguinte.

Cada lote confirma as alterações, as versões dos documentos, o cursor e a
renovação da trava em um único [commit atômico do Firestore](https://firebase.google.com/docs/firestore/reference/rest/v1/projects.databases.documents/commit).
As escritas exigem o `updateTime` lido. Um conflito reconsulta o lote, com até
três tentativas adicionais, preservando alterações concorrentes. Se a resposta
de um commit se perder, a retomada usa o cursor efetivamente persistido.

Falhas deixam o progresso disponível para uma nova execução do mesmo comando.
Uma trava abandonada expira; não é necessário apagá-la manualmente. `--rescan`
reinicia os cursores e as contagens da execução, preservando a proteção por
versão. Execuções normais pulam migrações já concluídas.

Checksums divergentes e histórico de migrações ausentes do checkout interrompem
a execução. Não edite uma definição já iniciada: cada alteração de esquema deve
ter uma nova definição. Erros de dados precisam de correção controlada antes da
retomada; uma transformação defeituosa pode exigir um plano de reparo específico.
Não há rollback genérico. Antes de remover ou converter dados irreversivelmente,
tenha backup validado e uma estratégia de restauração ou correção posterior.

As coleções de controle são internas e ficam cobertas pela negação padrão das
regras do Firestore. O executor usa permissões IAM da conta de serviço.

## Adicionar uma migração

Crie `scripts/migrations/definitions/0002-descricao.mjs` e registre o módulo e
seu arquivo em `scripts/migrations/registry.mjs`. A definição declara:

```js
export default {
  id: "0002-descricao",
  description: "Objetivo e resultado da transformação.",
  collections: [{ name: "dogs", from: 1, to: 2 }],
  transform({ document, collection, now }) {
    // Conferir dados e conflitos; produzir o estado de destino.
    return { set: { /* campo: FirestoreValue */ }, unset: [/* campos removidos */] };
  },
};
```

A função é síncrona, recebe uma cópia do documento e não deve fazer I/O. Campos
usam o formato nativo `FirestoreValue` para preservar int64, timestamps, referências,
arrays e mapas. `set` e `unset` atuam em campos de primeiro nível; um objeto pode
ser substituído como `mapValue`. Campos não selecionados permanecem intactos.
O executor grava `schemaVersion` automaticamente, no mesmo commit.
IDs dos documentos permanecem iguais; relações, slugs e referências externas
devem ser considerados explicitamente em cada mudança de semântica.

As versões são contínuas **por coleção**: uma próxima mudança só nos cães pode
elevar `dogs` para v2 enquanto `recycle_points` permanece em v1. Definições devem
ser autossuficientes, sem importar schemas ou regras de negócio mutáveis da
aplicação. Valide ambiguidades e colisões explicitamente; não escolha silenciosamente
entre um valor antigo e um novo que divergem.

Valide transformações, valores legados, falhas e retomada com
`npm run test:migrations`. O comando usa dados em memória, sem acessar produção.

O Vite do admin gera `scripts/migrations/worker-registry.mjs` ao iniciar ou fazer
build, incluindo as definições e os checksums dos arquivos originais. Esse arquivo
deve ser versionado e nunca editado manualmente. Para regenerá-lo antes dos testes:

```bash
node --input-type=module -e 'import { generateWorkerRegistry } from "./scripts/migrations/generate-worker-registry.mjs"; generateWorkerRegistry()'
```

O teste do registro verifica que CLI e Worker carregam exatamente as mesmas
definições e checksums. O bundle do Worker não depende de leitura do filesystem.

## Mudança semântica planejada

A evolução planejada do documento dos cães inclui nomes de campos em inglês e
uma representação mais precisa dos conceitos do domínio. A versão persistida
evolui separadamente do contrato da API: a substituição de `nome` por um campo
em inglês no Firestore, por exemplo, pode preservar o contrato público por
meio de adaptadores durante a transição.

O processo de transição é organizado em quatro etapas:

1. Definição do novo modelo e das conversões, distinguindo ausência, informação
   desconhecida e valor confirmado. Mudanças semânticas podem exigir transformação
   dos valores, além da renomeação dos campos.
2. Publicação de leitores compatíveis com os formatos antigo e novo em admin,
   público, cron e operações de mídia/arquivo. Durante a transição, os escritores
   mantêm os dois formatos e atribuem a versão adequada aos novos documentos.
3. Preenchimento dos novos campos por migração, preservando os antigos, seguido
   de verificação com `plan`. O uso de `--rescan` cobre registros legados inseridos
   por escritores antigos atrás do cursor.
4. Verificação dos consumidores e reconstrução dos caches afetados. A remoção
   da escrita antiga e dos campos obsoletos ocorre em uma etapa posterior,
   com uma definição de migração própria.

O admin recusa mutações em versões superiores às que seu código conhece. Isso
protege contra um escritor antigo após uma atualização do banco; não substitui
adaptadores nem torna seguro remover campos enquanto leitores antigos existem.

A migração inicial, `0001-publication-status`, preserva os
estados explícitos, publica os registros legados sem status e introduz v1 em
cães e pontos. A mudança semântica planejada requer definições próprias de
migração e adaptação dos consumidores; não integra essa definição inicial.
