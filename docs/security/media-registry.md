# Registro de mídia e exclusão concorrente

O registro `media_assets/{sha256(publicId)}` coordena as referências dos cães e o ciclo de vida de imagens gerenciadas no Cloudinary. A identidade é o `publicId`, normalizado pelo parser existente; URLs transformadas da mesma imagem compartilham o registro.

## Invariantes

- Criação, edição ou exclusão definitiva de cão e atualização das referências de mídia usam o mesmo commit Firestore, com precondições de criação/revisão para todos os documentos.
- `fotos` e `retainedPhotos` contam como referências. Remover uma foto da seleção não permite apagar uma imagem ainda retida pelo histórico da ficha.
- Vinculações novas são aceitas apenas em `ready`. `deleting` e `deleted` nunca voltam automaticamente para `ready`.
- A exclusão lê a revisão do registro antes de inventariar as fichas. Só depois da consulta sem referências pode trocar `ready` por `deleting` sob aquela revisão. Uma vinculação simultânea ou muda essa revisão ou observa o estado bloqueado; os dois commits não podem vencer.
- O Cloudinary é chamado somente depois de confirmar `deleting`. Falhas deixam esse estado persistido. Repetir o mesmo endpoint retoma a operação; o destroy existente trata imagem já ausente como sucesso. `deleted` torna novas repetições uma operação sem efeito.

## Compatibilidade com imagens legadas

Não é preciso converter todas as URLs antes de publicar o código. Registros ausentes são inicializados quando usados, e cada tentativa de excluir uma imagem inventaria todas as fichas, incluindo fotos retidas, antes de aplicar o bloqueio. `referencedBy` auxilia diagnóstico e é atualizado por novos escritores; não substitui o inventário porque referências anteriores ao registro podem não estar presentes nesse campo.

URLs externas ou de pastas não administradas continuam aceitas nas fichas, sem registro obrigatório. A API de exclusão não as remove. Fichas com versão futura/inválida bloqueiam a exclusão de mídia porque o escritor atual não pode afirmar que conhece todas as referências.

A consulta completa preserva segurança durante a transição. Ela tem custo proporcional ao catálogo e deverá ser substituída por um inventário integral comprovado e protocolo de referências completo na evolução de paginação e desempenho descrita em A05 da auditoria.

## Publicação e recuperação

Todos os escritores de fotos precisam usar o protocolo de registro. Não executar uma versão antiga que ignore `deleting` em paralelo com a versão nova. Depois de ativar exclusões pelo novo protocolo, rollback só pode usar uma versão que respeite esses estados. Escritas diretas por scripts/migrações também precisam preservar essa regra; mudanças manuais fora desse protocolo não recebem a garantia de concorrência.

Se uma exclusão falhar, repetir a mesma requisição autenticada permite retomá-la. Não remover o registro nem recolocar o estado em `ready` para contornar uma falha. Antes de qualquer reparo excepcional, reconciliar o estado real no Cloudinary e as referências no Firestore.

O protocolo protege o vínculo e a exclusão; não altera o formato das imagens, as regras de publicação, os slugs públicos ou o webhook do formulário.

Referências: [commit atômico do Firestore](https://docs.cloud.google.com/firestore/docs/reference/rest/v1/projects.databases.documents/commit), [precondições de documento](https://docs.cloud.google.com/firestore/docs/reference/rest/v1/Precondition).
