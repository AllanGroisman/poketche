# Tasks: PokeTche — App de Coleção e Marketplace de Pokémon TCG

**Input**: Design documents from `/specs/001-poketche-app/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/rest-api.md, quickstart.md

**Tests**: incluídos apenas onde a constituição exige (Princípio I — lógica de dinheiro: preços,
transações, comissões — e contratos de adapters externos) e nos fluxos de integração críticos.

**Organization**: tasks agrupadas por user story, em ordem de prioridade da spec
(P1: US1, US2 · P2: US3 · P3: US8, US4, US7, US10 · P4: US9, US5 · P5: US6, US11).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: paralelizável (arquivos distintos, sem dependência de task incompleta)
- **[Story]**: user story da task (US1–US11)
- Caminhos no monorepo: `apps/api/` (Fastify/Prisma) e `apps/mobile/` (Expo)

---

> **Status de implementação (2026-07-12, /speckit-implement)**: **Fase 1 (Setup) e Fase 2
> (Foundational T009–T020) completas e validadas.** Banco migrado (Postgres 16 + pgvector em
> :5434) com as constraints manuais aplicadas; catálogo sincronizado de verdade via
> `catalog-sync` (base1: 102 EN; sv1: 258 EN + 159 PT). Validação: `tsc --noEmit` OK (API e
> mobile), `eslint` OK, `prettier` OK e **36 testes passando** (money 14, idempotency 3,
> audit 3, contrato de catálogo 16). Proxy de imagens testado com fallback resiliente à fonte
> (constituição V) quando o R2 está indisponível.
>
> **Pendências antes das user stories**: criar os buckets R2 (`poketche-images`,
> `poketche-disputes`) para o cache de imagens funcionar de fato; rodar o `catalog-sync`
> completo (todas as edições); instalar deps mobile e validar em aparelho. **Gates das fases
> de dinheiro/integração**: spikes T034 (parecer legal), T066 (scanner) e T076 (custódia
> Pagar.me). O role de banco não-dono para o append-only do `financial_audit_log` (Princípio
> IV) é pré-requisito da US6.
>
> **US1 — Contas (2026-07-13, checkpoint)**: T022–T027 completas e validadas — perfil (`/me`),
> visibilidade granular + link público compartilhável (gerar/revogar, token opaco) com
> resolvedor público mínimo (404 opaco na revogação, SC-012), onboarding de vendedor via stub
> do `PaymentProvider`, e telas mobile (login/cadastro por e-mail, gate de sessão, tela de
> visibilidade). **46 testes passando** (inclui 10 de integração da US1 sobre banco de teste
> efêmero em :5435). T021 parcial: só e-mail/senha (login social/Apple pendente).
>
> **US2 — Registro da coleção (2026-07-13, checkpoint)**: T028–T033 completas e validadas —
> busca `/catalog/cards` multilíngue com pg_trgm (autocomplete ranqueado, exibição localizada
> com fallback EN), endpoints da coleção com merge por chave única (carta+condição+idioma+
> variante), telas mobile de busca com debounce e lista/adicionar/editar/remover (preço de
> aquisição > 0). **55 testes passando** (9 novos de integração da US2).
>
> **US3 — Precificação automática (2026-07-14, checkpoint)**: T035–T041 completas e validadas
> — `PriceProvider` isolado com fonte internacional USD (pokemontcg.io/TCGplayer) + PTAX/BACEN
> e resolver com fallback por carta; `LigaPriceCollector` pronto mas **DESLIGADO** por flag
> (`PRICING_LIGA_ENABLED=false`) aguardando o parecer T034; jobs `price-refresh` (dois níveis)
> e `price-snapshot` (append-only) no pg_boss e no CLI; preço+fonte+data no `GET /collection`
> com total e itens sem cotação indicados; telas mobile com `PriceTag` e valor total. Corrigido
> um bug do `0001_constraints.sql` (usava DROP CONSTRAINT num índice único → dois índices
> colidiam no `ON CONFLICT`); agora só o `NULLS NOT DISTINCT` permanece. **87 testes passando**
> (20 unit de pricing, 8 de contrato da Liga, 4 de integração de fallback). **T034 permanece
> pendência externa** (parecer legal) — a ativação da coleta Liga não foi implementada.
>
> **US8 — Estatísticas e histórico por carta (2026-07-14, checkpoint)**: T042–T045 completas e
> validadas — módulo puro `pricing/history.ts` (variações 7/30/90d com referência honesta em ou
> antes da janela, maior/menor, ganho/perda vs. aquisição ou desde a adição, tendência de 7d),
> endpoint `/collection/items/:id/details` e endpoint público `/catalog/cards/:id/price-history`;
> **sem interpolar** — períodos sem dados vêm `null` e `history_available=false` (< 2 snapshots)
> vira "histórico indisponível". `GET /collection` agora traz `trend` por item (FR-041). Mobile:
> tela de detalhes com gráfico de barras sem dependência (`Sparkline`), variações/ganho-perda/
> maior-menor e `TrendBadge` na listagem. **110 testes passando** (+23: 18 unit de variações,
> 5 de integração dos endpoints de detalhe/histórico). US4/US7/US10 (resto do P3) não iniciadas.
>
> **US4 — Estatísticas da coleção (2026-07-15, checkpoint)**: T046–T049 completas e validadas —
> módulo puro `stats/valuation.ts` (valor total, distribuição set/rarity/type, top valor,
> valorização/desvalorização e P&L vs. aquisição reusando a variação honesta da US8, completude
> por edição), endpoints `/stats/overview|history|distribution|rankings|completion` e job diário
> `collection-value-snapshot` (idempotente por dia, mesma valoração da listagem) agendado e no
> CLI. Mobile: dashboard (`app/dashboard`) com valor+evolução (Sparkline), distribuição/rankings
> segmentados e completude, sem dependência de gráfico. **128 testes passando** (+18: 9 unit de
> estatísticas, 9 de integração incluindo o job de snapshot). Nota: distribuição por tipo conta
> a carta em cada tipo (grupos sobrepostos, não somam ao total). US7/US10 (resto do P3) não
> iniciadas.
>
> **US7 — Visitante não autenticado (2026-07-16, checkpoint)**: T050–T053 completas e validadas —
> visão pública da coleção por share link respeitando os três flags do dono, com estatísticas
> básicas independentes da lista (o dono pode ocultar as cartas e ainda compartilhar o tamanho),
> 404 opaco na revogação/privacidade e `no-store` (visibilidade vale imediatamente, FR-003a).
> Duas decisões de vazamento: `position_value_cents` só sai com valores **e** quantidades
> autorizados (valor ÷ preço revelaria a quantidade), e o total agregado continua permitido só
> com valores (não revela carta nenhuma). Preço de aquisição e id do item nunca saem. Mobile:
> tela somente leitura por deep link (`poketche://public/<token>`), gate do `_layout.tsx`
> liberando o grupo `public`, e `auth-guard` conduzindo a ação restrita ao cadastro com retorno
> ao contexto. **137 testes passando** (+9 de integração: matriz de visibilidade + revogação).
>
> **US10 — Explorador de catálogo (2026-07-16, checkpoint)**: T054–T059 completas e validadas —
> edições → grade → detalhe sem conta (SC-020), com `Cache-Control` + `ETag`/304 (`catalog/
> cache.ts`), busca com filtros combináveis dentro do SQL que ordena, completude navegável por
> edição e ações rápidas para autenticados. Decisão estrutural que amarra a US10 inteira:
> **nada por usuário entra em payload cacheável** — posse/completude são rotas autenticadas sem
> cache, e o app compõe as duas fontes na tela. Três bugs latentes corrigidos de passagem: o
> filtro `set` da busca encolhia a página (filtrava o top-N já ranqueado); a grade ordenaria
> "10" antes de "2" (`card.number` é texto → índice por expressão no `0002_catalog_indexes.sql`);
> e o ETag do detalhe ignoraria o `price-refresh` se olhasse só o `synced_at`. **163 testes
> passando** (+26: 20 de integração do explorador, 6 unit de `selectCardMarketPrice`).
> **Pendências da US10**: o atalho em lote p/ wishlist (FR-072) e a ação rápida "adicionar à
> wishlist" (FR-071) dependem da **US9**; `/catalog/cards/:id/listings` responde `[]` até a
> **US6**. Desvio de contrato registrado: a posse do detalhe vem de `GET /collection?card_id=`
> (o contrato cita `/collection/items?card_id=`, rota que não existe — GET é `/collection`).
>
> **Ambiente (2026-07-16)**: máquina nova — Docker Desktop instalado, `pnpm` só via `corepack
> pnpm` (não está no PATH). O `prettier --check` acusa ~93 arquivos por CRLF (`core.autocrlf=
> true` sem `.gitattributes`, e `endOfLine: "lf"` no default): é artefato de checkout no
> Windows, não formatação — o conteúdo no repo é LF. Considerar um `.gitattributes` (T098/T102).
> Atenção: o banco de teste é `tmpfs` — recriado a cada `docker compose up`, exige
> `prisma migrate deploy` + `prisma/manual/{0001_constraints,0002_catalog_indexes}.sql` na :5435
> outra vez. As suítes de integração rodam **em paralelo contra o mesmo banco**: fixtures novas
> precisam de nomes de carta exclusivos (a busca ranqueia sobre todas as traduções) e asserções
> de ETag devem usar recursos que só a própria suíte toca.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: monorepo, apps base e ferramentas — nada específico de story

- [x] T001 Criar monorepo pnpm workspaces com `apps/mobile` e `apps/api` (package.json raiz, pnpm-workspace.yaml, .gitignore, .editorconfig)
- [x] T002 Inicializar `apps/api`: Node 22 + TypeScript 5 + Fastify + Prisma + Zod + pg_boss (apps/api/package.json, tsconfig.json, src/index.ts vazio)
- [x] T003 Inicializar `apps/mobile`: Expo SDK managed + expo-router + TypeScript (apps/mobile/package.json, app.json, app/_layout.tsx)
- [x] T004 [P] Configurar ESLint + Prettier compartilhados no monorepo (eslint.config.js, .prettierrc na raiz)
- [x] T005 [P] docker-compose com PostgreSQL 16 para dev e banco efêmero de teste (docker-compose.yml)
- [x] T006 [P] Configuração de ambiente validada com Zod — nunca commitar secrets (apps/api/src/lib/config.ts, apps/api/.env.example)
- [x] T007 [P] Setup de testes: Vitest na API (unit/integration/contract com banco efêmero) e Jest + Testing Library no mobile (apps/api/vitest.config.ts, apps/mobile/jest.config.js)
- [x] T008 [P] CI mínima: lint + testes nos dois apps (.github/workflows/ci.yml)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: infraestrutura da qual TODAS as stories dependem — auth, banco, catálogo base, libs de dinheiro/auditoria

**⚠️ CRITICAL**: nenhuma story começa antes desta fase completa

- [x] T009 Prisma schema inicial + framework de migrations: card_set, card, card_translation (com índices pg_trgm/GIN do data-model), user_profile, collection_visibility (apps/api/src/db/schema.prisma, migrations/)
- [x] T010 Bootstrap Fastify: server, registro de módulos, error handler padrão `{error:{code,message}}` com códigos HTTP do contrato (apps/api/src/app.ts, src/lib/errors.ts)
- [x] T011 Auth Supabase: verificação de JWT `Authorization: Bearer`, decorator de usuário, suporte a claim de papel `admin` (apps/api/src/modules/auth/plugin.ts)
- [x] T012 [P] Lib de dinheiro em centavos inteiros (nunca float) com testes de unidade (apps/api/src/lib/money.ts, tests/unit/money.test.ts)
- [x] T013 [P] Middleware de idempotência por header `Idempotency-Key` para rotas 💰 (apps/api/src/lib/idempotency.ts)
- [x] T014 [P] Audit writer + migration de `financial_audit_log` append-only com REVOKE de UPDATE/DELETE (apps/api/src/lib/audit.ts, migration)
- [x] T015 Runner pg_boss e registro de jobs no mesmo processo da API (apps/api/src/jobs/index.ts)
- [x] T016 `CatalogProvider` adapter isolado: pokemontcg.io (EN, canônico) + TCGdex (PT, casado por set/número — resolvedor exact→normId→contagem) com testes de contrato por fixtures (apps/api/src/integrations/catalog/, tests/contract/catalog.test.ts)
- [x] T017 Job `catalog-sync` diário: sincroniza catálogo multilíngue completo para o Postgres (apps/api/src/jobs/catalog-sync.ts, src/jobs/run.ts)
- [x] T018 Proxy de imagens com cache em Cloudflare R2 + job `image-backfill` priorizado (edições recentes/populares → coleções/wishlists/anúncios → restante; thumbnails antes) (apps/api/src/integrations/storage/r2.ts, src/modules/catalog/images.ts, src/jobs/image-backfill.ts)
- [x] T019 Mobile: cliente da API REST tipado + sessão de auth Supabase (apps/mobile/src/services/api.ts, src/services/auth.ts)
- [x] T020 Mobile: componentes base com estados de loading/erro/retry e helpers de formatação BRL/datas (apps/mobile/src/components/, src/lib/format.ts)

**Checkpoint**: fundação pronta — stories podem começar (em paralelo, se houver equipe)

---

## Phase 3: User Story 1 — Contas e perfis (P1) 🎯 MVP

**Goal**: cadastro/login (e-mail + Google + Apple), visibilidade da coleção com link compartilhável, início do onboarding de vendedor

**Independent Test**: criar conta, logar/deslogar, alternar visibilidade (coleção mesmo vazia), gerar/revogar link, preencher cadastro de vendedor (status)

- [ ] T021 [US1] Configurar Supabase Auth: e-mail/senha + Google + Sign in with Apple, incluindo vinculação de conta social a e-mail existente (config Supabase + apps/api/docs/auth-setup.md) — **parcial**: e-mail/senha e verificação JWT (JWKS) prontos e testados; Google configurado no painel; **botões de login social no app, Apple e vinculação de conta pendentes** (fora do escopo desta rodada — só e-mail)
- [x] T022 [P] [US1] Endpoints GET/PATCH `/me` (perfil + preferências) (apps/api/src/modules/account/routes.ts)
- [x] T023 [P] [US1] Endpoints GET/PUT `/me/visibility` + POST `/me/visibility/share-link` (gerar/revogar share_token não adivinhável) + resolvedor público mínimo `/public/collections/:shareToken` (semente da US7) (apps/api/src/modules/account/visibility.ts)
- [x] T024 [US1] Onboarding de vendedor: POST/GET `/me/seller` chamando `PaymentProvider.createRecipient` (interface + stub; adapter real na US6) e guardando apenas kyc_status (apps/api/src/modules/account/seller.ts, src/integrations/payments/provider.ts)
- [x] T025 [US1] Mobile: telas de cadastro/login e logout, com gate de navegação por sessão (apps/mobile/app/(auth)/, src/features/account/) — login social (Google/Apple) pendente com a T021
- [x] T026 [US1] Mobile: tela de perfil com visibilidade granular (cartas/valores/quantidades) e compartilhar link (apps/mobile/app/settings/visibility.tsx)
- [x] T027 [US1] Teste de integração: fluxo conta → visibilidade → share-link → revogação (apps/api/tests/integration/account.test.ts)

**Checkpoint**: US1 funcional e testável isoladamente

---

## Phase 4: User Story 2 — Registro manual da coleção (P1) 🎯 MVP

**Goal**: buscar no catálogo com autocomplete multilíngue e manter a coleção (condição, idioma, variante, quantidade, preço de aquisição)

**Independent Test**: buscar carta (EN e PT), adicionar com atributos, ver na lista com imagem oficial, editar e remover; merge de duplicata por chave única

- [x] T028 [P] [US2] Migration `collection_item` com UNIQUE(user, card, condition, language, variant) — já materializada na migration `init` (schema + 0001_constraints); combinação usada no merge do POST
- [x] T029 [P] [US2] Endpoint 🔓 GET `/catalog/cards` — busca única multilíngue com pg_trgm sobre card_translation (autocomplete; filtros completos na US10) (apps/api/src/modules/catalog/search.ts, localize.ts)
- [x] T030 [US2] Endpoints da coleção: POST (merge por unique + `wishlist_matches[]` stub), PATCH/DELETE (regra 422/desativação entra na US6), GET `/collection` com ordenação (apps/api/src/modules/collection/routes.ts)
- [x] T031 [US2] Mobile: busca com autocomplete (debounce) e imagem no idioma (fallback EN) (apps/mobile/app/collection/search.tsx, src/features/collection/api.ts)
- [x] T032 [US2] Mobile: telas lista da coleção + adicionar/editar/remover item (validação de preço de aquisição > 0) (apps/mobile/app/collection/)
- [x] T033 [US2] Teste de integração: adicionar/merge/editar/remover + busca com catálogo de fixtures (apps/api/tests/integration/collection.test.ts)

**Checkpoint**: MVP núcleo (US1+US2) completo — inventário digital funcional

---

## Phase 5: User Story 3 — Precificação automática (P2)

**Goal**: preço em BRL por carta com fonte + data, ciclos em dois níveis, fallback resiliente

**Independent Test**: cartas exibem preço BRL + fonte + data; com a fonte primária fora, o app segue operante com últimas cotações

- [ ] T034 [US3] 🚧 SPIKE (gate da coleta Liga): obter parecer legal sobre coleta da Liga Pokémon + redistribuição de imagens (pokemontcg.io/TCGdex); registrar resultado em specs/001-poketche-app/research.md §2/§8 — a coleta Liga permanece atrás de flag desligada até aprovação · **PENDÊNCIA EXTERNA (não implementada)** — a ativação da coleta Liga aguarda este parecer
- [x] T035 [P] [US3] Migrations `card_price` (UNIQUE (card_id, condition, variant, source) NULLS NOT DISTINCT) + `card_price_snapshot` — já materializadas na migration `init`; corrigido o `0001_constraints.sql` (DROP INDEX, não DROP CONSTRAINT) para não deixar dois índices únicos colidindo no upsert
- [x] T036 [US3] Interface `PriceProvider` + fonte internacional por carta (USD via pokemontcg.io/TCGplayer) + cliente PTAX/BACEN (walk-back + cache diário) + resolver com fallback por carta (apps/api/src/integrations/pricing/{types,international,ptax,resolver,sanity}.ts)
- [x] T037 [US3] `LigaPriceCollector` isolado atrás de flag `PRICING_LIGA_ENABLED` (DESLIGADA): parser com fixtures, seletores centralizados, `LigaParseError` → fallback; testes de contrato (apps/api/src/integrations/pricing/liga/collector.ts, tests/contract/liga.test.ts)
- [x] T038 [US3] Job `price-refresh` em dois níveis (hot diário: coleções/wishlists/edições recentes; tail fatiado em 7 por dia) com upsert idempotente gated por sanidade + job `price-snapshot` append-only; registrados no pg_boss e no CLI (apps/api/src/jobs/price-refresh.ts, price-snapshot.ts)
- [x] T039 [US3] Testes de unidade obrigatórios (constituição I): sanidade, conversão PTAX/USD→BRL, seleção de fonte/fallback, seleção da cotação vigente por item (apps/api/tests/unit/pricing.test.ts — 20 casos)
- [x] T040 [US3] Preço + fonte + data na coleção (`GET /collection`: preço vigente, valor da posição, `summary` com total e itens sem preço excluídos com indicação) + telas mobile (src/features/pricing/PriceTag, total na lista)
- [x] T041 [US3] Teste de integração: primária fora por flag/indisponível → ciclo completa via fallback e última cotação preservada na sanidade + snapshot append-only (apps/api/tests/integration/pricing-fallback.test.ts)

**Checkpoint**: coleção precificada com resiliência de fontes

---

## Phase 6: User Story 8 — Estatísticas e histórico por carta (P3)

**Goal**: detalhe da carta com gráfico, variações por período, maior/menor, ganho/perda vs. aquisição, tendência

**Independent Test**: com ≥2 snapshots, detalhe mostra gráfico e variações; com <2, "histórico indisponível"; ganho/perda exato

- [x] T042 [P] [US8] Endpoint GET `/collection/items/:id/details` — variações 7/30/90d/desde-adição, maior/menor, valor da posição, ganho/perda (apps/api/src/modules/collection/details.ts) · lógica pura em `src/modules/pricing/history.ts`; `history_available` sinaliza < 2 snapshots
- [x] T043 [P] [US8] Endpoint 🔓 GET `/catalog/cards/:id/price-history?period=7d|30d|90d|all` a partir dos snapshots (apps/api/src/modules/catalog/price-history.ts) — público/cacheável, variante de mercado com mais pontos, `change` do período sem interpolar
- [x] T044 [US8] Testes de unidade: cálculo de variações, lacunas sem interpolação, ganho/perda (apps/api/tests/unit/variations.test.ts — 18 casos) + integração dos dois endpoints (apps/api/tests/integration/card-details.test.ts — 5 casos)
- [x] T045 [US8] Mobile: tela de detalhes com gráfico (Sparkline sem dependência), variações/ganho-perda/maior-menor e "histórico indisponível"; `TrendBadge` na listagem (apps/mobile/app/collection/details.tsx, src/features/pricing/history/) — nota: rota `details.tsx` seguindo a convenção plana do app (não `[itemId].tsx`)

**Checkpoint**: análise por carta completa

---

## Phase 7: User Story 4 — Estatísticas da coleção (P3)

**Goal**: dashboard com valor total, evolução, distribuições, rankings e completude

**Independent Test**: total = Σ preço×quantidade; gráficos e completude batem com fixtures

- [x] T046 [P] [US4] Job `collection-value-snapshot` diário — a tabela `collection_value_snapshot` já veio na migration `init`; job append-only reusa `valueSnapshot` (mesma regra da listagem), idempotente por dia UTC; agendado às 06:00 (após o price-snapshot) e no CLI `jobs:run collection-value-snapshot [--user=]` (apps/api/src/jobs/collection-value-snapshot.ts)
- [x] T047 [US4] Endpoints `/stats/overview|history|distribution|rankings|completion` — lógica pura em `src/modules/stats/valuation.ts`; overview (valor total + contagens + delta vs. último snapshot), history (evolução por snapshots + ponto ao vivo), distribution (set/rarity/type; tipo sobrepõe), rankings (top_value/gainers/losers/acquisition_pnl reusando a variação honesta da US8), completion por edição (apps/api/src/modules/stats/routes.ts)
- [x] T048 [US4] Mobile: dashboard com valor+evolução (Sparkline), distribuição e rankings segmentados, completude — `BarList`/`RankingList`/`Segmented` sem dependência de gráfico (apps/mobile/app/dashboard/index.tsx, src/features/stats/); link a partir da home
- [x] T049 [US4] Testes: unit de valoração/distribuição/rankings/completude (apps/api/tests/unit/stats.test.ts — 9 casos, constituição I) + integração stats vs. fixtures incluindo o job de snapshot (apps/api/tests/integration/stats.test.ts — 9 casos)

**Checkpoint**: dashboard funcional

---

## Phase 8: User Story 7 — Acesso de visitante (P3)

**Goal**: visão pública de coleção via link respeitando visibilidade; ações restritas conduzem ao cadastro com retorno ao contexto

**Independent Test**: abrir link sem sessão → visão conforme configuração do dono; revogado → 404 opaco; ação restrita → cadastro → retorno

- [x] T050 [US7] Endpoint 🔓 GET `/public/collections/:shareToken` aplicando show_cards/values/quantities; 404 opaco quando revogado/privado (apps/api/src/modules/collection/public.ts) — o resolvedor semente saiu de `account/visibility.ts`; `Cache-Control: no-store` (mudança de visibilidade vale imediatamente); `position_value_cents` exige valores **e** quantidades (o valor revelaria a quantidade oculta)
- [x] T051 [US7] Mobile: tela pública somente leitura + deep link do share link (apps/mobile/app/public/[shareToken].tsx, src/features/public/api.ts) — a tela não decide o que esconder: renderiza o que a API mandou
- [x] T052 [US7] Mobile: guard de navegação — ação restrita sem sessão → cadastro/login → retorno ao ponto de origem (apps/mobile/src/services/auth-guard.ts) — retorno guardado em memória e consumido pelo gate do `_layout.tsx`, que passou a liberar as rotas do grupo `public`
- [x] T053 [US7] Teste de integração: matriz de visibilidade + revogação (apps/api/tests/integration/public-collection.test.ts — 9 casos)

**Checkpoint**: compartilhamento público seguro

---

## Phase 9: User Story 10 — Explorador de Catálogo (P3)

**Goal**: navegação pública do catálogo completo (edições → grade → detalhe), busca com filtros, completude navegável

**Independent Test**: sem conta, edições → grade → detalhe com preço/histórico em ≤3 toques; com conta, posse/ações rápidas/completude

- [x] T054 [P] [US10] Endpoints 🔓 `/catalog/sets`, `/catalog/sets/:id/cards` (paginado), `/catalog/cards/:id` — todos com Cache-Control + ETag invalidados pelo sync (apps/api/src/modules/catalog/explorer.ts) · helper novo em `catalog/cache.ts` (ETag fraco sobre o `MAX(synced_at)` das linhas da resposta + 304 no `If-None-Match`); o ETag do **detalhe** também dobra `card_price.fetched_at`, senão o price-refresh mudaria o corpo sem mexer no `synced_at`; `:id` de edição aceita uuid **e** external_id
- [x] T055 [P] [US10] Estender GET `/catalog/cards` com filtros edição/raridade/tipo/faixa de preço (sem cotação fora do filtro com indicação) + índices de apoio (apps/api/src/modules/catalog/search.ts, prisma/manual/0002_catalog_indexes.sql) — **filtros movidos para dentro do SQL que ordena** (antes o `set` filtrava o top-N já ranqueado e encolhia a página); `q` virou opcional (navegar só com filtros); `unpriced_excluded` conta as cartas que o filtro de preço deixou de fora (FR-069); query inválida agora é **400**, não `{results:[]}` com 200
- [x] T056 [US10] Endpoints autenticados: `/catalog/sets/:id/completion` (possuídas/faltantes + atalho lote wishlist) e `/catalog/cards/:id/listings` — posse fora dos payloads cacheáveis (apps/api/src/modules/catalog/completion.ts) · `pct` extraído para `stats/valuation.completionPct` e compartilhado com o dashboard; `/listings` é 🔓 (contrato) e responde `[]` até a US6; **o atalho em lote p/ wishlist depende da US9** — a API já devolve `missing_card_ids` para habilitá-lo
- [x] T057 [US10] Mobile: telas do explorador — lista de edições (logo/data/total), grade progressiva, detalhe público (apps/mobile/app/explore/{index,set,card}.tsx, src/features/catalog/api.ts) — rotas planas com params, seguindo a convenção do app
- [x] T058 [US10] Mobile: indicador de posse + ações rápidas + visão de completude com atalho p/ wishlist (apps/mobile/app/explore/set.tsx, card.tsx) — posse e grade são **compostas no cliente** (a grade cacheada serve a todos); filtro "ver faltantes" na grade; ação restrita passa pelo `auth-guard`. **Ação "adicionar à wishlist" pendente da US9**
- [x] T059 [US10] Teste de integração: busca com filtros <1s, cache ETag, visitante sem dados de posse (apps/api/tests/integration/explorer.test.ts — 20 casos) + 6 unit de `selectCardMarketPrice`

**Checkpoint**: descoberta pública completa

---

## Phase 10: User Story 9 — Wishlists com preço-alvo (P4)

**Goal**: wishlists nomeadas, preço-alvo com notificação push anti-spam, integração com coleção e marketplace

**Independent Test**: criar wishlist com alvo; baixar preço via fixture; 1 push sem repetição até rearme; sinalização "já na coleção"; pergunta de remoção

- [ ] T060 [P] [US9] Migrations `wishlist` + `wishlist_item` (alert_state, last_notified_at) (apps/api/src/db/migrations/)
- [ ] T061 [US9] Endpoints CRUD wishlists/itens + GET com preço atual/alvo/diferença/atingiu-alvo/já-na-coleção (apps/api/src/modules/wishlist/routes.ts)
- [ ] T062 [P] [US9] Adapter Expo Notifications + endpoint POST `/me/push-tokens` (apps/api/src/integrations/push/, src/modules/account/push-tokens.ts)
- [ ] T063 [US9] Job `wishlist-alerts` após price-refresh: alvo pela menor cotação entre variantes, rearme + intervalo mínimo 24h, toggles por wishlist/global, no máx. 1 notificação por evento (apps/api/src/jobs/wishlist-alerts.ts)
- [ ] T064 [US9] Testes de unidade: regras de rearme/intervalo/oscilação/variantes (apps/api/tests/unit/wishlist.test.ts)
- [ ] T065 [US9] Mobile: telas de wishlists + destaques de anúncios ≤ alvo + pergunta/auto-remoção ao registrar carta (integra POST /collection/items `wishlist_matches[]`) (apps/mobile/app/wishlists/, src/features/wishlist/)

**Checkpoint**: demanda ativa alimentando o app

---

## Phase 11: User Story 5 — Scanner com sessões (P4)

**Goal**: sessões de escaneamento contínuo com identificação (carta + idioma + variante default), feedback em camadas, revisão, recuperação e gravação local

**Independent Test**: sessão com ~10 cartas PT/EN (foil, duplicata) em aparelho físico: ≥80% identificadas, captura ≤2s, idioma ≥90%, revisão obrigatória, sessão recuperável, vídeo só no aparelho

- [ ] T066 [US5] 🚧 SPIKE (gate da story): comparativo do pipeline `CardIdentifier` — OCR on-device (ML Kit) vs. backend, com casos obrigatórios: promos fora do padrão NNN/MMM, layouts antigos, reverse foil; custo do índice on-device distribuído; registrar decisão em specs/001-poketche-app/research.md §3
- [ ] T067 [P] [US5] Migrations `scan_session` + `scan_capture` (language_detected, variant, identification_method) (apps/api/src/db/migrations/)
- [ ] T068 [US5] Interface `CardIdentifier` (`identify(crop) → {card, language, variant, confidence, candidates[], method}`) + implementação vencedora do spike, trocável (apps/api/src/modules/scanner/identifier/)
- [ ] T069 [US5] Endpoints de sessão: criar (409 se pendente), capturas, PATCH/DELETE captura, summary, confirm (+wishlist_matches), discard, pending (apps/api/src/modules/scanner/routes.ts)
- [ ] T070 [US5] Mobile: câmera vision-camera com detecção de retângulo em tempo real, molduras, captura automática com contador (apps/mobile/src/features/scanner/camera/)
- [ ] T071 [US5] Mobile: feedback padrão vs. celebratório (raridade/valor/wishlist), sons toggleáveis, duplicata incrementa com indicação (apps/mobile/src/features/scanner/feedback.ts)
- [ ] T072 [US5] Mobile: tela de revisão — resolver "a revisar" com candidatos, ajustar qty/condição/idioma/variante, resumo estatístico, confirmar/descartar (apps/mobile/src/features/scanner/review/)
- [ ] T073 [US5] Mobile: sessão pendente única com recuperação na abertura do app (storage local + GET pending) (apps/mobile/src/services/scan-session-storage.ts)
- [ ] T074 [US5] Mobile: escolha de câmera lembrada + gravação local opt-in (tela com overlays/áudio), sem degradar detecção (desativar com aviso se sem capacidade), assistir/salvar/compartilhar/descartar + outro visual opcional; vídeo nunca sai do aparelho (apps/mobile/src/features/scanner/recording/)
- [ ] T075 [US5] Testes de integração da API de sessões: fluxo capturas → revisão → confirm/discard, nada na coleção antes de confirmar (apps/api/tests/integration/scanner.test.ts)

**Checkpoint**: diferencial competitivo entregue sem bloquear nada

---

## Phase 12: User Story 6 — Marketplace (P5)

**Goal**: anúncios com frete, carrinho multi-vendedor, checkout com custódia e split, envio com rastreio, liberação, disputas e avaliação mútua

**Independent Test**: 3 usuários (2 vendedores KYC sandbox): carrinho com 2 vendedores → checkout → 2 pedidos → envio → recebimento → liberação por pedido; cancelar um pedido pago; disputa com reembolso

- [ ] T076 [US6] 🚧 SPIKE (gate da story): custódia Pagar.me em sandbox — validações (a) retenção sem repasse, (b) liberação por comando, (c) reembolso pós-retenção, (d) prazos compatíveis, (e) frete no split (comissão só item), (f) cobrança única multi-recebedor + reembolso parcial por pedido; registrar em specs/001-poketche-app/research.md §4 (plano B: 1 cobrança por pedido ou Mercado Pago)
- [ ] T077 [P] [US6] Migrations `user_address`, `listing` (frete + quantity_reserved/sold + CHECK), `cart_item`, `checkout`, `order`, `order_item`, `dispute`, `dispute_evidence`, `review` (apps/api/src/db/migrations/)
- [ ] T078 [US6] Adapter `PaymentProvider` → Pagar.me: recipients/KYC real (completa T024), cobrança única com split multi-recebedor, liberação controlada, reembolso parcial — testes de contrato com sandbox/fixtures (apps/api/src/integrations/payments/pagarme/, tests/contract/pagarme.test.ts)
- [ ] T079 [US6] Endpoints de anúncios: criar (KYC aprovado, 422 quantity > possuída), editar/desativar, busca 🔓 com filtros; regras de coleção (422 abaixo do comprometido, remoção desativa) nos endpoints de collection (apps/api/src/modules/marketplace/listings.ts)
- [ ] T080 [P] [US6] Endpoints `/me/addresses` CRUD (apps/api/src/modules/account/addresses.ts)
- [ ] T081 [US6] Carrinho: endpoints `/cart/items` com revalidação de disponibilidade/preço no GET (apps/api/src/modules/marketplace/cart.ts)
- [ ] T082 [US6] Checkout 💰: reserva atômica tudo-ou-nada em todas as listings, um pedido por vendedor (frete = maior do grupo), endereço congelado, cobrança única do total, idempotência no checkout (apps/api/src/modules/marketplace/checkout.ts)
- [ ] T083 [US6] Testes de unidade obrigatórios (constituição I/IV): invariantes total/comissão/net com frete, reserva/devolução de estoque, compra parcial, propriedade `net = itens − comissão + frete` (apps/api/tests/unit/orders.test.ts)
- [ ] T084 [US6] Máquina de estados do pedido + endpoints 💰 shipment (carrier+tracking obrigatórios), confirm-receipt (liberação split), cancel (livre antes do envio, reembolso parcial da cobrança) — cada transição audita (apps/api/src/modules/marketplace/orders.ts)
- [ ] T085 [US6] Webhook `/webhooks/payments` assinado e idempotente por provider_event_id → transições + auditoria (apps/api/src/modules/marketplace/webhooks.ts)
- [ ] T086 [US6] Jobs `order-deadlines` (expiração checkout com devolução de reservas; liberação auto 21d pós-postagem; atraso de envio 5 dias úteis) + `payments-reconciliation` (apps/api/src/jobs/order-deadlines.ts, payments-reconciliation.ts)
- [ ] T087 [US6] Disputas: abrir 💰 (suspende liberação) + evidências em bucket R2 privado com URLs assinadas restritas às partes (apps/api/src/modules/marketplace/disputes.ts)
- [ ] T088 [US6] Avaliação mútua (1 por parte/pedido) + reputação materializada de vendedor e comprador + GET 🔓 `/users/:id/reputation` (apps/api/src/modules/marketplace/reviews.ts)
- [ ] T089 [US6] Mobile: busca/filtros de anúncios (visitante incluso), detalhe com histórico de preço, criar/editar anúncio com frete (apps/mobile/app/market/, src/features/marketplace/)
- [ ] T090 [US6] Mobile: carrinho + checkout (endereço salvo/novo, total por vendedor, Pix QR/cartão) + acompanhamento de pedidos com rastreio (apps/mobile/src/features/marketplace/checkout/, orders/)
- [ ] T091 [US6] Mobile: fluxo do vendedor (pedidos recebidos, confirmar envio com transportadora+rastreio, endereço do pedido), disputa com envio de evidências, avaliações (apps/mobile/src/features/marketplace/seller/, disputes/)
- [ ] T092 [US6] Teste de integração completo com provedor mockado: checkout multi-vendedor, falha de pagamento (nada efetivado), cancelamento pré-envio, oversell concorrente (409), fluxo feliz até released com auditoria íntegra (apps/api/tests/integration/marketplace.test.ts)

**Checkpoint**: modelo de receita operante com dinheiro auditado

---

## Phase 13: User Story 11 — Administração de disputas (P5)

**Goal**: back-office interno (fila, evidências, solicitação de informações, decisão com auditoria, conflito de interesse)

**Independent Test**: com papel admin: fila → detalhes/evidências → request-info → decidir ambos os desfechos; 403 para admin-parte e para usuário sem papel

- [ ] T093 [P] [US11] Guard de papel `admin` + regra de conflito de interesse (admin ∉ partes do pedido) aplicada a todas as rotas `/admin/*` (apps/api/src/modules/admin/guard.ts)
- [ ] T094 [US11] Endpoints: GET fila (com tempo vs. prazos-alvo), GET detalhe (pedido + evidências), POST request-info (→ awaiting_parties + notificação + prazo 3d), POST resolve 💰 (refund total | release net via PaymentProvider + resolved_by + auditoria + notificação) (apps/api/src/modules/admin/disputes.ts)
- [ ] T095 [US11] Tela web interna mínima servida pela API (fila, detalhe, ações) (apps/api/src/modules/admin/ui/)
- [ ] T096 [US11] Expiração de `awaiting_parties` no job order-deadlines + notificações às partes (apps/api/src/jobs/order-deadlines.ts)
- [ ] T097 [US11] Teste de integração: 403 sem papel, 403 admin-parte, request-info + expiração, ambos os desfechos com auditoria (apps/api/tests/integration/admin.test.ts)

**Checkpoint**: disputas nunca ficam sem operação

---

## Phase 14: Polish & Cross-Cutting Concerns

- [ ] T098 [P] Revisão de UX mobile-first: estados de loading/erro/retry em todas as telas, fluxos curtos (apps/mobile/src/)
- [ ] T099 [P] Revisão LGPD: payloads públicos sem dados pessoais, endereço restrito às partes e oculto pós-conclusão, evidências nunca públicas (apps/api/src/modules/)
- [ ] T100 Rate limiting nas rotas públicas 🔓 + headers de segurança (apps/api/src/lib/rate-limit.ts)
- [ ] T101 Verificação de performance: EXPLAIN das buscas (<1s, SC-003/SC-021), eficácia do cache ETag, abertura de link público <5s (SC-012), captura ≤2s (SC-006a) (relatório em specs/001-poketche-app/perf-notes.md)
- [ ] T102 [P] README do monorepo + docs de setup dev alinhadas ao quickstart (README.md)
- [ ] T103 Executar a validação end-to-end completa do quickstart.md (todas as linhas da tabela por story + checks transversais) e corrigir o que falhar

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (1)** → **Foundational (2)** → stories; **Polish (14)** por último.
- Toda story depende apenas da Fase 2, exceto onde indicado abaixo.

### User Story Dependencies

- **US1 (P1)**: só Fase 2.
- **US2 (P1)**: US1 (conta para possuir coleção) + catálogo sincronizado (T016–T018).
- **US3 (P2)**: US2 (itens para precificar). T034 (parecer legal) gateia apenas a coleta Liga (T037 em produção) — o fallback internacional não espera por ele.
- **US8 (P3)**: US3 (snapshots).
- **US4 (P3)**: US3 (valores); rankings usam cálculos da US8 (T042) — implementar após.
- **US7 (P3)**: US1 (share link) + US2 (conteúdo).
- **US10 (P3)**: Fase 2 (catálogo) + US3 para preço no detalhe (degradado sem ela).
- **US9 (P4)**: US2 (catálogo/coleção) + US3 (alvos por cotação).
- **US5 (P4)**: US2 (destino das capturas); T066 (spike) antes das demais tasks da fase.
- **US6 (P5)**: US1 (KYC), US2 (itens), US3 (referência de preço); T076 (spike custódia) antes de T078+.
- **US11 (P5)**: US6 (disputas existem); entregar junto com a US6 — disputas não podem nascer sem operação.

### Within Each User Story

- Migrations → adapters/serviços → endpoints → mobile → testes de integração.
- Spikes (T034, T066, T076) são a **primeira** task de suas fases e bloqueiam o restante da fase (T034 bloqueia apenas a ativação da coleta Liga).

### Parallel Opportunities

- Fase 1: T004–T008 em paralelo após T001–T003.
- Fase 2: T012, T013, T014 em paralelo; T016–T018 em sequência; T019–T020 em paralelo com a trilha da API.
- Após a Fase 2: US1 pode rodar em paralelo com o restante da Fase 2 de catálogo se T009–T015 estiverem prontos.
- Pós-US3: US8, US4, US7 e US10 são amplamente independentes entre si — paralelizáveis por 4 pessoas.
- US9 e US5 paralelizáveis entre si; US6 pode começar (spike + migrations) em paralelo com P4.
- Dentro das fases, tasks [P] tocam arquivos distintos.

---

## Parallel Example: pós-US3 (equipe de 4)

```text
Dev A: T042–T045 (US8 — detalhes por carta)
Dev B: T046–T049 (US4 — dashboard)
Dev C: T050–T053 (US7 — visitante)
Dev D: T054–T059 (US10 — explorador)
```

## Implementation Strategy

### MVP First

1. Fases 1–2 (Setup + Foundational).
2. **US1 + US2 = MVP núcleo**: inventário digital com contas (validar SC-001/SC-002/SC-003).
3. **US3** transforma inventário em avaliação (proposta de valor central) — recomendado no MVP de lançamento.
4. Parar e validar com usuários antes de P3+.

### Incremental Delivery

- Cada checkpoint é um incremento entregável; P3 (US8/US4/US7/US10) maximiza engajamento e aquisição antes das apostas maiores (scanner, marketplace).
- US6+US11 são um pacote único de release (dinheiro nunca sem operação de disputas), condicionado ao spike T076 e ao parecer T034 não trazer bloqueios ao modelo.

### Notes

- Tasks 💰/dinheiro seguem a constituição IV: centavos inteiros, idempotência, auditoria — os testes T012, T039, T083 são obrigatórios, não opcionais.
- Commitar por task ou grupo lógico; parar em qualquer checkpoint para validar a story isoladamente.
