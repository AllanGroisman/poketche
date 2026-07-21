# Phase 0 — Research & Decisions: Coleções Personalizadas

Todas as incógnitas são de **design de reuso** (a stack já está definida pelo app existente). Não há NEEDS CLARIFICATION técnico pendente. Decisões abaixo.

## D1 — Granularidade do vínculo

- **Decisão**: O vínculo (`CollectionMembership`) referencia o `collection_item` (posição de inventário: carta + condição + idioma + variante, com sua quantidade), não a carta canônica.
- **Rationale**: Confirmado com o usuário na clarificação; é o mais fiel a "recorte do inventário" e permite reusar `positionValueCents`/`valueSnapshot` da US4 sem adaptação (essas funções operam sobre itens com `{cardId, condition, variant, quantity}`). Merge de quantidade no inventário reflete automaticamente no recorte.
- **Alternativas rejeitadas**: Vínculo no nível de carta canônica (como wishlist) — perderia a distinção condição/variante e exigiria somar posições para valorar, divergindo do modelo de valor da US4.

## D2 — Reuso da valoração (US4), sem reimplementar

- **Decisão**: A contagem e o valor do recorte usam `overview(items, pricesByCard)` (ou `valueSnapshot` + distinct/quantity inline) de `stats/valuation.ts`, aplicados apenas aos `collection_item` vinculados.
- **Rationale**: `overview` já devolve exatamente `{ total_cents, priced_items, unpriced_items, distinct_cards, total_quantity }` — cobre a clarificação de contagem (cartas distintas **e** unidades) e garante que preço/valor nunca discordem entre inventário, recorte e dashboard. Funções puras → seguras de reusar sem tocar na US4.
- **Alternativas rejeitadas**: Recalcular valor no módulo novo (viola a diretriz de reuso e arrisca drift); adicionar `where` de pasta em `stats/routes.ts` (acoplaria o dashboard às pastas — risco de regressão em US4).

## D3 — Reuso da listagem/apresentação (US2)

- **Decisão**: `GET /collections/:id` devolve os itens do recorte no **mesmo shape** de `GET /collection`, reusando `serialize()` e `includeCard` de `collection/routes.ts`. No mobile, a tela do recorte reusa a mesma FlatList, row (imagem/nome/set/condição/`PriceTag`/quantidade/`TrendBadge`) e busca do inventário — só troca a fonte de dados e o cabeçalho de resumo.
- **Rationale**: Diretriz explícita de "não criar tela de listagem paralela". `serialize` hoje é interno ao módulo → será **exportado** (sem mudar lógica).
- **Alternativas rejeitadas**: Um serializer/componente de listagem próprio da feature (duplicação e risco de divergência visual).

## D4 — Modelagem do compartilhamento por coleção (US5)

- **Decisão**: Campos de visibilidade **inline** no model `Collection` (`status VisibilityStatus @default(private)`, `shareToken String? @unique`, `showCards/showValues/showQuantities Boolean`), reusando o enum e as flags da US7. Token gerado por `generateShareToken()`. Rota pública em caminho distinto `GET /public/custom-collections/:shareToken`.
- **Rationale**: Sharing é opt-in por pasta e 1:1 com a pasta → campos inline são mais simples que uma tabela separada (a `CollectionVisibility` é separada só porque é 1:1 com o **usuário**, não com uma entidade própria). Reuso do gerador de token e da renderização pública (`publicItem`/`buildSummary`) evita reinvenção. Caminho `/public/custom-collections/:token` evita colisão com `/public/collections/:token` da US7.
- **Alternativas rejeitadas**: Tabela `CollectionShare` separada (complexidade sem ganho); reusar a mesma rota pública da US7 (colisão semântica e de path).

## D5 — Contrato dos endpoints e paginação

- **Decisão**: REST sob `/api/v1`, Zod para validação, `requireAuth` em tudo exceto a rota pública. **Sem paginação** nas listagens, seguindo a convenção atual de `GET /collection` (US2) e `GET /wishlists` (US9), que retornam a coleção inteira.
- **Rationale**: Consistência com os padrões estabelecidos; volume individual não justifica paginação nesta fase (spec Assumptions). Se necessário no futuro, paginar junto com o inventário para manter paridade.
- **Alternativas rejeitadas**: Introduzir paginação só nesta feature (divergiria da US2 e complicaria o reuso do componente de listagem).

## D6 — Remoção de vínculo: chave de operação

- **Decisão**: `DELETE /collections/:id/items/:collectionItemId` (remove o vínculo pela pasta + id do item de inventário, escopo do dono), em vez de exigir o id do membership.
- **Rationale**: O app conhece o `collection_item.id` (é o `item.id` que já usa na listagem), não o id do vínculo. Remover por (collectionId, collectionItemId) é natural e idempotente via `deleteMany`.
- **Alternativas rejeitadas**: Expor o id do membership ao cliente (dado interno desnecessário).

## D7 — Idempotência do vínculo

- **Decisão**: `POST /collections/:id/items` com `{ collection_item_id }` usa `createMany({ skipDuplicates: true })` (ou `create` com catch P2002 → tratado como sucesso idempotente), apoiado no `@@unique([collectionId, collectionItemId])`.
- **Rationale**: Espelha a idempotência do batch de wishlist; vincular duas vezes não é erro (spec FR-009).
- **Alternativas rejeitadas**: 409 em revínculo (contraria FR-009).

## D8 — Validação de posse ao vincular

- **Decisão**: Antes de criar o vínculo, validar que o `collection_item_id` pertence ao `userId` do requisitante e que a pasta também é dele (`ownedCollection()` no padrão `ownedWishlist()`); caso contrário, 404 opaco.
- **Rationale**: spec FR-010 (só itens próprios, só pastas próprias; recursos de terceiros tratados como inexistentes).
- **Alternativas rejeitadas**: Confiar no vínculo e falhar por FK (vazaria diferença entre "não existe" e "não é seu").
