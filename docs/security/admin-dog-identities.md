# Identidade administrativa de cães

Novas fichas usam o ID aleatório do documento Firestore como identidade canônica. O cadastro não cria mais um identificador numérico baseado em `Date.now()`. Duas criações no mesmo milissegundo recebem documentos independentes.

O contrato administrativo inclui `documentId` e `revision`. O campo numérico `id` é opcional e mantido apenas quando já existe nos dados legados. O frontend identifica cards, ações, edições e restaurações por `documentId`, sem depender desse campo antigo.

As rotas canônicas usam o segmento explícito `doc:<documentId>`, codificado com `encodeURIComponent` no cliente. Exemplo: `/api/admin/dogs/doc%3Aa1B2c3`. O prefixo evita confundir um documento cujo nome seja composto somente por números com um identificador numérico legado.

Links antigos como `/api/admin/dogs/123` continuam resolvendo o campo numérico `id`. A consulta lê no máximo dois resultados: se houver duplicidade, responde 409 e orienta abrir a ficha pela listagem atual. Nenhuma ficha é escolhida arbitrariamente. A listagem continua permitindo abrir os documentos individualmente pela rota canônica.

O endpoint GET `/api/admin/dog-identity-inventory`, exclusivo de developer, usa `inventoryLegacyDogIds` em `apps/admin/worker/dog-identity.ts` para retornar apenas os identificadores duplicados e os respectivos IDs de documentos; não inclui nomes ou outros campos. Revise o inventário no ambiente isolado antes da publicação e no ambiente alvo durante a verificação controlada de implantação. Se houver duplicidades, as correções devem ser explícitas, com precondições e registro dos documentos afetados; não é necessário renomear documentos para usar as novas rotas.

IDs públicos, registros de slugs e URLs públicas existentes permanecem intactos. Backfills de identidade devem preservar IDs de documentos e registros de slugs existentes.

Alterações de cães enviam `If-Match` com a revisão exata que foi lida. O cliente não busca uma revisão nova silenciosamente para repetir uma ação antiga. Quando faltar a revisão, a pessoa deve recarregar; se houver conflito, deve recarregar e revisar a decisão antes de tentar novamente.

O mock administrativo segue o mesmo contrato: documento aleatório, revisão por ficha, rotas canônicas e compatibilidade numérica legada. Ele não representa uma migração nem modifica recursos remotos.
