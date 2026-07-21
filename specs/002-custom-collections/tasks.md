---
description: 'Task list — Coleções Personalizadas'
---

# Tasks: Coleções Personalizadas

**Input**: Design documents from `/specs/002-custom-collections/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/rest-api.md, quickstart.md

**Tests**: INCLUÍDOS. A feature exibe valor monetário (constituição I — Qualidade Testada) e o `quickstart.md` lista testes de integração obrigatórios (recorte == valoração, dashboard inalterado, cascatas, sharing). Testes de integração no padrão `apps/api` (Vitest + `buildApp({ prismaClient, authOverride })`).

**Organization**: Agrupado por user story (US1–US5), em ordem de prioridade (P3 core → P4).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivo diferente, sem dependência pendente)
- **[Story]**: US1–US5 (fases de story)
- Caminhos de arquivo exatos incluídos

## Path Conventions

- Backend: `apps/api/src/...`, testes em `apps/api/test/...` (monorepo pnpm)
- Mobile: `apps/mobile/src/...` e telas em `apps/mobile/app/(tabs)/collection/...`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Esqueleto dos novos módulos, sem lógica.

- [X] T001 [P] Criar módulo backend `apps/api/src/modules/collections/routes.ts` exportando um stub `registerCustomCollections(app, prisma)` (vazio), separado do `collection/` singular (inventário)
- [X] T002 [P] Criar feature mobile `apps/mobile/src/features/collections/api.ts` com os tipos `Collection`, `CollectionSummary`, `CollectionSliceItem` e stubs sobre `apiRequest`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema, migração e reusos que TODAS as stories dependem.

**⚠️ CRITICAL**: Nenhuma user story começa antes desta fase.

- [X] T003 Adicionar os models `Collection` e `CollectionMembership` + relações inversas (`UserProfile.collections`, `CollectionItem.memberships`) em `apps/api/prisma/schema.prisma`, conforme data-model.md (sem alterar colunas/uniques de `collection_item`)
- [X] T004 Gerar e aplicar a migração: `apps/api/prisma/migrations/20260720130000_custom_collections/migration.sql` (só CREATE TABLE + FKs/uniques/índices). Aplicada com `prisma migrate deploy`, **não** `migrate dev`: o SQL manual em `prisma/manual/` faz o `migrate dev` acusar drift e propor reset (dropa o catálogo já sincronizado)
- [X] T005 [P] Exportar `serialize` em `apps/api/src/modules/collection/routes.ts` (tornar público, sem mudar lógica) para reuso na listagem do recorte
- [X] T006 [P] Adicionar helper `ownedCollection(prisma, id, userId)` (espelha `ownedWishlist`, 404 opaco) em `apps/api/src/modules/collections/routes.ts`
- [X] T007 Registrar `registerCustomCollections` em `apps/api/src/app.ts` dentro do escopo `/api/v1`

**Checkpoint**: Fundação pronta — as user stories podem começar.

---

## Phase 3: User Story 1 - Organizar o inventário em coleções personalizadas (Priority: P3) 🎯 MVP

**Goal**: Criar, renomear e excluir pastas nomeadas; excluir apaga só o agrupamento.

**Independent Test**: Criar "Favoritas", renomear para "Top 10", excluir; confirmar que o `summary` de `GET /collection` (inventário completo) não muda em nenhum passo.

### Tests for User Story 1

- [X] T008 [P] [US1] Teste de integração CRUD + escopo de posse (404 opaco para pasta de outro) + exclusão de pasta não altera o `summary` do inventário, em `apps/api/test/collections-crud.test.ts`

### Implementation for User Story 1

- [X] T009 [US1] Implementar `POST /collections` (Zod `name` 1–60, trim; 201) em `apps/api/src/modules/collections/routes.ts`
- [X] T010 [US1] Implementar `GET /collections` básico (id, name, item_count via `_count`, created_at) em `apps/api/src/modules/collections/routes.ts`
- [X] T011 [US1] Implementar `PATCH /collections/:id` (rename via `ownedCollection`) em `apps/api/src/modules/collections/routes.ts`
- [X] T012 [US1] Implementar `DELETE /collections/:id` (`deleteMany` escopo do dono; cascata só em `collection_membership`) em `apps/api/src/modules/collections/routes.ts`
- [X] T013 [P] [US1] Adicionar `getCollections/createCollection/renameCollection/deleteCollection` em `apps/mobile/src/features/collections/api.ts`
- [X] T014 [US1] Criar a lista de coleções com criar/renomear(long-press)/excluir em `apps/mobile/app/(tabs)/collection/index.tsx`, reusando `Input`/`Button`/`ListRow`/`AsyncBoundary` (espelha `app/(tabs)/wishlists/index.tsx`)

**Checkpoint**: US1 funcional e testável isolada.

---

## Phase 4: User Story 2 - Adicionar e remover cartas de uma coleção (Priority: P3)

**Goal**: Vincular/desvincular itens do inventário para/de pastas (M-N, idempotente, sem duplicar no inventário).

**Independent Test**: Vincular um item a duas pastas, confirmar 1× no inventário; desvincular de uma e confirmar que permanece na outra e no inventário.

### Tests for User Story 2

- [X] T015 [P] [US2] Teste de integração: vínculo idempotente, desvínculo, item em N pastas conta 1× no inventário, 404 de posse, e cascata (remover `collection_item` remove vínculos), em `apps/api/test/collections-membership.test.ts`

### Implementation for User Story 2

- [X] T016 [US2] Implementar `POST /collections/:id/items` (`ownedCollection` + validar posse do `collection_item_id`; idempotente via `@@unique`/`skipDuplicates`) em `apps/api/src/modules/collections/routes.ts`
- [X] T017 [US2] Implementar `DELETE /collections/:id/items/:collectionItemId` (`deleteMany` por collection+item, idempotente) em `apps/api/src/modules/collections/routes.ts`
- [X] T018 [P] [US2] Adicionar `addToCollection/removeFromCollection` em `apps/mobile/src/features/collections/api.ts`
- [X] T019 [US2] Adicionar a ação "adicionar/remover de coleção" na tela de detalhe do item `apps/mobile/app/(tabs)/collection/details.tsx` (seletor das pastas do usuário)

**Checkpoint**: US1 e US2 funcionam independentemente.

---

## Phase 5: User Story 3 - Abrir uma coleção e ver o recorte com estatísticas próprias (Priority: P3)

**Goal**: Recorte com a mesma listagem/busca/apresentação do inventário + resumo (cartas distintas · unidades + valor) reusando a valoração da US4.

**Independent Test**: Recorte com itens de preço conhecido → `summary.total_cents` == Σ preço×qtd; item sem preço em `unpriced_items`; `GET /stats/overview` do inventário inalterado.

### Tests for User Story 3

- [X] T020 [P] [US3] Teste de integração: `GET /collections/:id` com itens no mesmo shape do inventário; `summary` == `overview()` manual (distinct/unidades/valor); item sem preço fora do total; dashboard `GET /stats/overview` inalterado após operações de pasta, em `apps/api/test/collections-slice.test.ts`

### Implementation for User Story 3

- [X] T021 [US3] Implementar `GET /collections/:id?sort=recent|oldest` (carregar `collection_item` vinculados com `includeCard`, serializar com o `serialize` reusado, resumo via `overview()` de `stats/valuation.ts`) em `apps/api/src/modules/collections/routes.ts`
- [X] T022 [P] [US3] Adicionar `getCollectionSlice(id, sort)` + tipos do item/summary em `apps/mobile/src/features/collections/api.ts`
- [X] T023 [US3] Criar a tela do recorte `apps/mobile/app/(tabs)/collection/folder.tsx` reusando a FlatList/linha/busca do inventário (`collection/index.tsx` original) e um cabeçalho de resumo com `formatBRL` (estilo `CollectionTotal`)

**Checkpoint**: US1–US3 independentes.

---

## Phase 6: User Story 4 - Hub de coleções na tela principal (Priority: P4)

**Goal**: Tela principal lista as pastas (nome, contagem distinct·unidades, valor) + acesso ao inventário completo.

**Independent Test**: 3 pastas listadas com nome/contagem/valor corretos + entrada de inventário completo; abrir cada uma e o inventário.

### Tests for User Story 4

- [X] T024 [P] [US4] Teste de integração: `GET /collections` retorna `summary` por pasta igual a `overview()` do recorte (sem N+1), em `apps/api/test/collections-hub.test.ts`

### Implementation for User Story 4

- [X] T025 [US4] Enriquecer `GET /collections` para incluir `summary` por pasta (carregamento agregado de memberships+itens+preços do usuário; `overview()` por pasta; sem N+1) em `apps/api/src/modules/collections/routes.ts`
- [X] T026 [US4] Extrair a listagem do inventário completo de `apps/mobile/app/(tabs)/collection/index.tsx` para `apps/mobile/app/(tabs)/collection/inventory.tsx` (mover sem alterar lógica; smoke test da listagem)
- [X] T027 [US4] Transformar `collection/index.tsx` no hub: pastas (nome, distinct·unidades, valor via `formatBRL`) + entrada "inventário completo", usando `apps/mobile/src/features/collections/CollectionRow.tsx` (novo, sobre `ListRow`)

**Checkpoint**: US1–US4 independentes.

---

## Phase 7: User Story 5 - Compartilhar uma coleção por link público (Priority: P4)

**Goal**: Gerar/revogar link público por pasta; visão pública isolada ao recorte, respeitando flags.

**Independent Test**: Ativar sharing, abrir o link sem autenticação (só o recorte, conforme flags), revogar → 404; excluir pasta → link para de funcionar.

### Tests for User Story 5

- [X] T028 [P] [US5] Teste de integração: gerar/revogar link; visão pública respeita `show_cards/values/quantities`; token revogado ou pasta excluída → 404 opaco; sem vazamento de outras pastas/inventário, em `apps/api/test/collections-share.test.ts`

### Implementation for User Story 5

- [X] T029 [US5] Implementar `PUT /collections/:id/visibility` e `POST /collections/:id/share-link` (reusar `generateShareToken`, enum `VisibilityStatus`, serializer de `share_url`) em `apps/api/src/modules/collections/share.ts`
- [X] T030 [P] [US5] Extrair `publicItem`/`buildSummary` de `apps/api/src/modules/collection/public.ts` para um helper reutilizável (ou exportá-los), sem mudar o comportamento da rota da US7
- [X] T031 [US5] Implementar `GET /public/custom-collections/:shareToken` (sem auth, `Cache-Control: no-store`, 404 opaco, renderização reusada sobre os itens vinculados) em `apps/api/src/modules/collections/public.ts`
- [X] T032 [US5] Registrar `registerCustomCollectionShare` e `registerCustomCollectionsPublic` em `apps/api/src/app.ts`
- [X] T033 [P] [US5] Adicionar `getCollectionShare/setCollectionVisibility/generateShareLink/revokeShareLink` em `apps/mobile/src/features/collections/api.ts`
- [X] T034 [US5] Criar a tela de compartilhamento `apps/mobile/app/(tabs)/collection/folder-share.tsx` (toggles de flags, gerar/revogar, exibir/copiar `share_url`), espelhando `app/settings/visibility.tsx`

**Checkpoint**: US1–US5 completas.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [X] T035 [P] Teste de unidade fixando `summary` do recorte == `overview()` sobre um fixture (guarda contra drift de valoração) em `apps/api/test/collections-valuation.unit.test.ts`
- [X] T036 Regressão: confirmar que `GET /stats/overview` e o job `collection-value-snapshot` continuam inalterados após operações de pasta (nenhuma referência a pastas no caminho do dashboard)
- [X] T037 [P] Atualizar a doc de contrato REST do projeto (`specs/001-poketche-app/contracts/rest-api.md` ou equivalente) com os endpoints novos, mantendo paridade snake_case
- [X] T038 Rodar a validação completa do `quickstart.md` (cenários 1–5) ponta-a-ponta — harness repetível em `apps/api/scripts/quickstart-e2e.ts` (`pnpm --filter api exec tsx scripts/quickstart-e2e.ts`): sobe a API real contra o banco de dev sob usuário e2e efêmero, 29/29 verificações. Passos de UI do cenário 4 (2 e 4) conferidos por inspeção de código, não por execução do app

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências.
- **Foundational (Phase 2)**: depende do Setup; **BLOQUEIA** todas as stories (schema/migração/reusos/registro).
- **User Stories (Phase 3–7)**: dependem da Fase 2. Em ordem de prioridade P3 (US1→US2→US3) → P4 (US4, US5).
- **Polish (Phase 8)**: depende das stories desejadas concluídas.

### User Story Dependencies

- **US1 (P3)**: após Foundational. Base das demais (precisa existir pasta).
- **US2 (P3)**: após US1 (precisa de uma pasta para vincular). Testável isolada via API.
- **US3 (P3)**: após US2 (recorte precisa de itens vinculados). Reusa `serialize` (T005) e `overview`.
- **US4 (P4)**: após US3 (reusa o mesmo cálculo de `overview` por pasta) e US1 (lista). A extração T026 é pré-requisito do hub T027.
- **US5 (P4)**: após US1 (pasta existe). Independente de US2–US4; reusa helpers da US7 (T030).

### Within Each User Story

- Teste de integração escrito antes e deve **falhar** antes da implementação.
- Rota/endpoint antes da tela mobile que o consome.
- `api.ts` mobile [P] pode ser feito em paralelo ao endpoint (contrato já definido).

### Parallel Opportunities

- Setup: T001 e T002 em paralelo.
- Foundational: T005 e T006 em paralelo (arquivos distintos); T003→T004 sequenciais; T007 após T001.
- Em cada story, o `api.ts` mobile ([P]) e o teste de integração ([P]) rodam em paralelo com a implementação do endpoint.
- US4 e US5 podem ser tocadas por pessoas diferentes após US3.

---

## Parallel Example: User Story 1

```bash
# Após a Fundação, iniciar em paralelo:
Task: "T008 Teste de integração CRUD em apps/api/test/collections-crud.test.ts"
Task: "T013 api.ts mobile (getCollections/create/rename/delete) em apps/mobile/src/features/collections/api.ts"
# Implementar os endpoints T009–T012 (mesmo arquivo routes.ts → sequenciais entre si)
```

---

## Implementation Strategy

### MVP First (US1)

1. Fase 1 (Setup) → 2. Fase 2 (Foundational) → 3. Fase 3 (US1) → **PARAR e VALIDAR** (criar/renomear/excluir sem afetar inventário) → demo.

### Incremental Delivery

1. Setup + Foundational → fundação pronta.
2. US1 (CRUD) → testar → demo (MVP das pastas).
3. US2 (vínculos) → testar → demo.
4. US3 (recorte + stats) → testar → demo (feature de organização completa).
5. US4 (hub) → polir a navegação.
6. US5 (sharing) → compartilhamento por link.

### Parallel Team Strategy

Após a Fundação: uma pessoa toca o backend (routes → share → public), outra o mobile (api.ts → telas), sincronizando pelo contrato em `contracts/rest-api.md`.

---

## Notes

- `[P]` = arquivos diferentes, sem dependência pendente.
- Reuso é regra (research.md): `overview()`/`valueSnapshot()` (US4), `serialize`/`includeCard` (US2), `ownedWishlist`→`ownedCollection`, `generateShareToken`/renderização pública (US7). **Não** reimplementar cálculo de valor nem criar listagem paralela.
- Verificar que o teste de integração falha antes de implementar.
- Commit após cada task ou grupo lógico.
- Migração: `migrate dev` em desenvolvimento; `migrate deploy` em ambiente com dados (nunca SQL manual — evita drift).
- Evitar: dependências entre stories que quebrem a independência; mexer no caminho do dashboard (US4) ou nas colunas de `collection_item`.
