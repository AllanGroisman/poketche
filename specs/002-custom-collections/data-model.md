# Phase 1 — Data Model: Coleções Personalizadas

Duas entidades novas. **Nenhuma alteração** em `collection_item` além de adicionar a relação inversa (não muda colunas, uniques nem a relação inventário↔usuário). Money em centavos inteiros (não há novo campo monetário — valor de recorte é derivado, não persistido).

## Entidade: Collection (coleção personalizada)

Tabela `collection`. Uma pasta nomeada, recorte do inventário, pertencente a um usuário. Inclui o estado de compartilhamento público opcional (US5), com os mesmos campos da `CollectionVisibility` da US7.

| Campo | Tipo | Regras |
|---|---|---|
| id | UUID (pk) | `@default(uuid())` |
| userId | UUID (fk → user_profile) | `onDelete: Cascade` (excluir conta → some as pastas) |
| name | String | obrigatório; trim; 1–60 chars (Zod, igual à wishlist) |
| status | VisibilityStatus | reuso do enum US7; `@default(private)` |
| shareToken | String? | `@unique`; opaco (`generateShareToken()`); null quando privada |
| showCards | Boolean | `@default(true)` |
| showValues | Boolean | `@default(false)` |
| showQuantities | Boolean | `@default(false)` |
| createdAt | DateTime | `@default(now())` |
| updatedAt | DateTime | `@updatedAt` |

Relações: `user UserProfile` (Cascade); `memberships CollectionMembership[]`. Índice `@@index([userId])`.

Regras de negócio:
- Excluir uma `Collection` → cascata apaga só suas `CollectionMembership` (nunca `collection_item`).
- Nomes **não** precisam ser únicos por usuário (sem `@@unique` em name).
- Compartilhamento é opt-in: `status=private` + `shareToken=null` por padrão; gerar link = `status=public_link` + token; revogar = volta a private + token null.

### Prisma (a adicionar em `schema.prisma`)

```prisma
model Collection {
  id             String           @id @default(uuid()) @db.Uuid
  userId         String           @map("user_id") @db.Uuid
  name           String
  status         VisibilityStatus @default(private)
  shareToken     String?          @unique @map("share_token")
  showCards      Boolean          @default(true) @map("show_cards")
  showValues     Boolean          @default(false) @map("show_values")
  showQuantities Boolean          @default(false) @map("show_quantities")
  createdAt      DateTime         @default(now()) @map("created_at") @db.Timestamptz
  updatedAt      DateTime         @updatedAt @map("updated_at") @db.Timestamptz

  user        UserProfile            @relation(fields: [userId], references: [id], onDelete: Cascade)
  memberships CollectionMembership[]

  @@index([userId])
  @@map("collection")
}
```

## Entidade: CollectionMembership (vínculo)

Tabela `collection_membership`. Join muitos-para-muitos entre `Collection` e `collection_item`. Não carrega quantidade nem preço — esses vêm do `collection_item` referenciado.

| Campo | Tipo | Regras |
|---|---|---|
| id | UUID (pk) | `@default(uuid())` |
| collectionId | UUID (fk → collection) | `onDelete: Cascade` (excluir pasta → some o vínculo) |
| collectionItemId | UUID (fk → collection_item) | `onDelete: Cascade` (remover item do inventário → some o vínculo) |
| createdAt | DateTime | `@default(now())` |

Restrições:
- `@@unique([collectionId, collectionItemId])` — idempotência do vínculo (uma carta só entra uma vez na pasta).
- `@@index([collectionItemId])` — para a cascata/consulta reversa.

### Prisma (a adicionar em `schema.prisma`)

```prisma
model CollectionMembership {
  id               String   @id @default(uuid()) @db.Uuid
  collectionId     String   @map("collection_id") @db.Uuid
  collectionItemId String   @map("collection_item_id") @db.Uuid
  createdAt        DateTime @default(now()) @map("created_at") @db.Timestamptz

  collection     Collection     @relation(fields: [collectionId], references: [id], onDelete: Cascade)
  collectionItem CollectionItem @relation(fields: [collectionItemId], references: [id], onDelete: Cascade)

  @@unique([collectionId, collectionItemId])
  @@index([collectionItemId])
  @@map("collection_membership")
}
```

## Relações inversas a adicionar (edições mínimas)

- `UserProfile` (linha ~217): adicionar `collections Collection[]`.
- `CollectionItem` (linha ~296): adicionar `memberships CollectionMembership[]`.
  - Nenhum outro campo/unique de `CollectionItem` muda. A `@@unique([userId, cardId, condition, language, variant])` permanece.

## Cascatas — verificação explícita (contra os riscos de regressão)

| Ação | Efeito | Não afeta |
|---|---|---|
| Excluir `Collection` | apaga suas `CollectionMembership` | `collection_item`, inventário, stats gerais |
| Remover `collection_item` (inventário) | apaga as `CollectionMembership` daquele item em todas as pastas | outras pastas, outros itens |
| Excluir conta (`UserProfile`) | apaga `collection` → cascata `collection_membership` | catálogo/cartas |
| Vincular item já vinculado | no-op (viola `@@unique` → tratado como idempotente) | quantidade/valor do inventário |

## Migração

- `pnpm --filter api prisma migrate dev --name custom_collections` (gera `prisma/migrations/<ts>_custom_collections/migration.sql`).
- Seguir a memória do projeto: usar `migrate dev` em desenvolvimento para gerar a migração; **em ambientes com dados usar `migrate deploy`** (nunca SQL manual — evita drift). Ver [[prisma-migrate-deploy-not-dev]].
- A migração só **cria** as duas tabelas + FKs/uniques/índices; nenhuma alteração destrutiva em tabelas existentes.

## Derivados (não persistidos)

- **Resumo do recorte**: `{ total_cents, priced_items, unpriced_items, distinct_cards, total_quantity }` calculado em request via `overview()` de `stats/valuation.ts` sobre os `collection_item` vinculados. Não há tabela de snapshot de recorte (fora de escopo; o snapshot diário permanece só do inventário completo — US4).
