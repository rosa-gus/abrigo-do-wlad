# Política de leitura e monitoramento de candidaturas

A API administrativa só pode liberar dados de uma candidatura enquanto `expiresAt`
for uma data ISO válida e estritamente posterior ao relógio do servidor. No instante
exato do vencimento, a candidatura desaparece da listagem e o detalhe responde como
indisponível. Datas ausentes ou inválidas também negam a leitura.

Essa restrição é independente da exclusão física pelo cron. Um cron indisponível não
reabre a leitura. A camada administrativa filtra os documentos antes de chamar a
descriptografia e confere o vencimento novamente após a operação assíncrona, antes
de devolver o conteúdo. A consulta Firestore usa `GREATER_THAN` no timestamp de
vencimento para evitar carregar candidaturas já vencidas; a validação local mantém
a política de negação mesmo diante de dados inválidos ou adaptadores de testes.

O filtro `timestampAfter` de `listDocuments` ordena primeiro pelo campo da
desigualdade e por ID como desempate, conforme o contrato Firestore. Quando a tela
precisar de ordem por envio, pode ordenar o conjunto retornado em memória. Incluir
outro campo no `orderBy` da consulta pode exigir índice composto; o deploy do índice
deve preceder o uso dessa variante em produção.

O job de limpeza mantém a exclusão em lotes com precondições de versão e ajustes
atômicos dos contadores de chaves. A leitura administrativa não modifica registros,
não prorroga a retenção e não depende dessas exclusões.

O monitoramento da limpeza usa uma tolerância operacional explícita de **24 horas**
após o vencimento, um intervalo completo do cron diário. Essa tolerância é apenas
para identificar atraso na exclusão física; ela não amplia o período de leitura.
Cada lote observado registra contagem de vencidas, maior idade desde o vencimento,
contagem além da tolerância e tolerância usada. Os eventos são:

- `adoption.retention.observed`: atraso dentro da tolerância;
- `adoption.retention.overdue`: log de erro quando há persistência além da tolerância;
- `admin.adoption.invalid-expiration`: diagnóstico agregado de registros com datas
  inválidas encontrados na camada administrativa.

Os eventos não incluem nomes, telefones, IDs de candidaturas, ciphertext ou chaves.
O operador deve monitorar o evento `adoption.retention.overdue`, as falhas do cron e
o resultado `hasMore` da limpeza. Datas inválidas exigem diagnóstico de metadados
por responsável técnico autorizado, sem liberar automaticamente dados pessoais.
Configuração de notificações externas no serviço de observabilidade e investigação
de dados de produção são operações separadas da alteração do código.

Referência: [Firestore — ordenação e filtros por desigualdade](https://firebase.google.com/docs/firestore/query-data/order-limit-data).
