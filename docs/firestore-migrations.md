# Migrações do Firestore

O executor local versiona transformações dos documentos, sem executar migrações
durante requisições do site ou no cron. Usa a API REST e a conta de serviço do
ambiente, sempre no banco `(default)`. Não modifica imagens nem outros serviços.

## Executar

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
