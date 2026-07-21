# Implementation Plan: Coleções Personalizadas

**Branch**: `002-custom-collections` | **Date**: 2026-07-20 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-custom-collections/spec.md`

## Summary

Adicionar **Coleções Personalizadas**: pastas nomeadas que são recortes do inventário já existente, mais compartilhamento público por pasta (US5, confirmado em escopo). É uma **adição enxuta sobre o app existente** — nada do inventário (US2), das estatísticas gerais (US4) ou das wishlists (US9) muda. Duas entidades novas (`Collection` + `CollectionMembership`), um módulo de rotas REST seguindo o padrão Fastify+Zod+Prisma do projeto, e uma feature mobile nova que **reutiliza** a listagem/apresentação do inventário e a valoração das estatísticas. O vínculo aponta para o `collection_item` (a posição de inventário), então contagem e valor de recorte reusam diretamente as funções puras de valoração da US4.

## Technical Context

**Language/Version**: TypeScript (Node.js, ESM) no backend; TypeScript + React Native (Expo ~52, React 18.3) no mobile.

**Primary Dependencies**: Fastify + Zod + Prisma (PostgreSQL) na API; Expo Router 4 + NativeWind 4 no app; sem novas dependências.

**Storage**: PostgreSQL via Prisma. Duas tabelas novas (`collection`, `collection_membership`); nenhuma alteração em `collection_item` ou `user_profile`.

**Testing**: Vitest de integração na API (mesmo padrão de `collection`/`wishlist`), rodando contra Prisma de teste via `buildApp({ prismaClient, authOverride })`. Lógica de valoração já coberta por testes de unidade da US4 (reusada, não reimplementada).

**Target Platform**: API Node em servidor; app iOS/Android (Expo).

**Project Type**: Monorepo pnpm — `apps/api` (backend REST sob `/api/v1`) + `apps/mobile` (Expo).

**Performance Goals**: Padrões de app mobile (resposta rápida, estados de loading/erro/retry — constituição VI). Sem metas numéricas específicas além do SC-001 (<5s para criar e ver a coleção).

**Constraints**: Valores monetários em centavos inteiros (constituição IV / spec FR-018). Visão pública nunca cacheável e 404 opaco (reuso do padrão US7). Sem comportamento automático de pastas (fora de escopo).

**Scale/Scope**: Uso individual por usuário; sem limites práticos de nº de coleções/cartas nesta fase (spec Assumptions). Listagens não paginadas, seguindo a convenção atual de `GET /collection` (US2).

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

- **I. Qualidade Testada** — ✅ A lógica que toca "preço/valor" é reusada de `stats/valuation.ts` (já testada). Os novos módulos de rota ganham testes de integração (CRUD, vínculo idempotente, cascata, escopo de posse, recorte, sharing) no padrão existente. Não é código financeiro de transação, mas exibe valor → cobrimos o cálculo de recorte reusando a função já verificada.
- **II. Simplicidade Primeiro** — ✅ Duas entidades e um módulo de rotas; zero novas dependências; reuso máximo (serializer de listagem, valoração, gerador de token, padrão de ownership). Nenhuma abstração nova. Sharing reusa o mecanismo da US7 em vez de inventar outro.
- **III. MVP Incremental** — ✅ Stories independentes: US1 (CRUD) → US2 (vínculos) → US3 (recorte+stats) → US4 (hub) → US5 (sharing). Cada uma entregável/testável isolada; US5 é aditiva e opcional (opt-in por pasta).
- **IV. Dinheiro é Crítico** — ✅ (aplicável parcialmente) Nenhuma transação/comissão. O único contato com dinheiro é **exibir** valor de recorte, feito com centavos inteiros e a mesma função de valoração da US4 — sem novo cálculo monetário.
- **V. Isolamento de Dados de Terceiros** — ✅ Não há nova integração externa; preços vêm da camada de pricing já isolada.
- **VI. UX Mobile-First** — ✅ Fluxos curtos (criar/renomear/excluir, add/remove do recorte), reuso dos componentes e estados de loading/erro/retry (`AsyncBoundary`) já existentes; sharing degradável (link é opt-in).

**Resultado do gate**: PASS. Sem violações → sem Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/002-custom-collections/
├── plan.md              # Este arquivo
├── research.md          # Fase 0 — decisões de design e reuso
├── data-model.md        # Fase 1 — Collection + CollectionMembership + sharing
├── quickstart.md        # Fase 1 — roteiro de validação ponta-a-ponta
├── contracts/
│   └── rest-api.md      # Fase 1 — contrato dos endpoints da feature
└── checklists/
    └── requirements.md  # (da /speckit-specify)
```

### Source Code (repository root)

Backend — novo módulo `apps/api/src/modules/collections/` (plural, "coleções personalizadas"; não confundir com o `collection/` singular = inventário):

```text
apps/api/
├── prisma/
│   ├── schema.prisma                      # + model Collection, CollectionMembership (editar)
│   └── migrations/<ts>_custom_collections/ # migração nova (migrate dev)
└── src/
    ├── modules/
    │   ├── collections/                    # NOVO módulo da feature
    │   │   ├── routes.ts                   # CRUD + vínculos + GET recorte (US1–US4)
    │   │   ├── share.ts                    # visibilidade + share-link por coleção (US5)
    │   │   └── public.ts                   # GET /public/custom-collections/:token (US5)
    │   ├── collection/routes.ts            # reusar: exportar `serialize`; `includeCard` já exportado
    │   ├── stats/valuation.ts              # reusar: `overview`/`valueSnapshot`/`positionValueCents`
    │   └── account/service.ts              # reusar: `generateShareToken`, `ensureProfile`
    └── app.ts                              # registrar os 3 novos registrars
```

Mobile — nova feature `apps/mobile/src/features/collections/` + telas em `app/(tabs)/collection/`:

```text
apps/mobile/
├── src/features/collections/
│   ├── api.ts                              # getCollections, create/rename/delete, add/remove, getSlice, share
│   └── CollectionRow.tsx                   # linha do hub (nome, contagem, valor) — usa ListRow
└── app/(tabs)/collection/
    ├── index.tsx                           # (editar) hub: lista coleções + acesso ao inventário completo
    ├── inventory.tsx                        # (extrair) a listagem completa atual vira uma rota própria
    ├── folder.tsx                           # recorte de uma coleção — REUSA a listagem/row do inventário
    └── folder-share.tsx                     # tela de compartilhamento da coleção (US5)
```

**Structure Decision**: Backend segue o padrão de módulo por domínio (`registerX(app, prisma)` sob `/api/v1`), espelhando `wishlist` (parent nomeado + join único) para CRUD/ownership e `collection/public.ts` + `account/visibility.ts` para sharing. Mobile segue a convenção `src/features/<domínio>/api.ts` + telas em Expo Router, **reutilizando** `ListRow`, `PriceTag`, `TrendBadge`, `AsyncBoundary`, `formatBRL` e o mesmo shape de item serializado do inventário. A tela `collection/index.tsx` atual (hoje = listagem do inventário) passa a ser o **hub**; a listagem completa é extraída para `inventory.tsx` sem alterar sua lógica.

## Pontos de integração com o código existente (US2, US4, US7)

**Reuso direto (sem modificar o comportamento existente):**

- **Valoração (US4)** — `apps/api/src/modules/stats/valuation.ts`: `overview()` / `valueSnapshot()` / `positionValueCents()` são funções **puras** sobre um array de itens. O recorte carrega só os `collection_item` vinculados e chama essas funções → contagem (cartas distintas + unidades, conforme clarificação) e valor total idênticos ao critério do dashboard. **Nenhuma reimplementação de cálculo.**
- **Listagem/apresentação (US2)** — `apps/api/src/modules/collection/routes.ts`: reusar `includeCard` (já exportado) e **exportar `serialize`** para que `GET /collections/:id` devolva itens no **mesmo shape** de `GET /collection`. No mobile, a tela do recorte reusa a mesma FlatList/row e a mesma busca da listagem do inventário — só muda a fonte (itens do recorte) e o cabeçalho de resumo.
- **Ownership + erros** — reusar o padrão `ownedWishlist()` (404 opaco), `ensureProfile()`, e os helpers `notFound`/`conflict` de `lib/errors.ts`.
- **Sharing (US7)** — reusar `generateShareToken()` (`account/service.ts`), o enum `VisibilityStatus`, as flags `show_cards/values/quantities`, o serializer de `share_url` (`${baseUrl}${token}`) e a renderização pública (`publicItem`/`buildSummary` de `collection/public.ts` — exportar ou extrair um helper compartilhado). Config `SHARE_LINK_BASE_URL` já existe.

**Alteração mínima em arquivos existentes:**

- `schema.prisma` — **adicionar** dois models + a relação inversa `collections Collection[]` em `UserProfile` e `memberships CollectionMembership[]` em `CollectionItem`. **Não alterar** campos/uniques de `collection_item` nem a relação inventário↔usuário.
- `collection/routes.ts` — **exportar** `serialize` (hoje é interno). Sem mudança de lógica.
- `collection/public.ts` — extrair `publicItem`/`buildSummary` para reuso (ou exportá-los). Sem mudança de comportamento da rota atual.
- `app.ts` — registrar `registerCustomCollections`, `registerCustomCollectionShare`, `registerCustomCollectionsPublic`.
- Mobile `collection/index.tsx` — vira hub; extrair a listagem para `inventory.tsx`.

## Riscos de regressão e mitigação

- **Estatísticas gerais (US4) passarem a considerar pastas** — _risco alto se mal feito._ Mitigação: o dashboard e o job de snapshot (`collection-value-snapshot.ts`) continuam consultando `collectionItem where userId` **sem** join com pastas. As novas rotas nunca escrevem em `collection_value_snapshot` nem chamam as rotas de stats. Teste de regressão: totais do dashboard idênticos antes/depois de criar/excluir coleções e mover cartas (SC-005).
- **Contagem/valor do inventário completo mudarem** — Mitigação: vínculo é referência; nenhuma escrita em `collection_item`. Excluir coleção = `deleteMany` só em `collection_membership`. Teste: SC-002/SC-003 (carta em N pastas conta 1× no inventário; excluir pasta não muda contagem/valor).
- **Cascata acidental apagar itens do inventário** — Mitigação: FKs de `collection_membership` com `onDelete: Cascade` apontando **para** membership (some quando a pasta OU o item saem); a FK para `collection_item` **não** tem cascata reversa que afete o item. Teste: remover item do inventário remove vínculos; excluir pasta não toca em `collection_item`.
- **Drift de preço entre inventário/recorte/dashboard** — Mitigação: recorte usa exatamente `selectCurrentPrice`+`valueSnapshot` (mesma fonte). Sem caminho de cálculo paralelo.
- **Conflito de rota pública** — `GET /public/collections/:shareToken` já é da US7 (coleção inteira). A rota de pasta usa caminho distinto (`/public/custom-collections/:shareToken`) para não colidir.
- **Quebra da listagem do inventário ao extrair para `inventory.tsx`** — Mitigação: mover o componente sem alterar lógica; smoke test da listagem completa após a extração.

## Complexity Tracking

> Sem violações de constituição — seção não aplicável.
