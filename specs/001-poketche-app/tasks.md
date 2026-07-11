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

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: monorepo, apps base e ferramentas — nada específico de story

- [ ] T001 Criar monorepo pnpm workspaces com `apps/mobile` e `apps/api` (package.json raiz, pnpm-workspace.yaml, .gitignore, .editorconfig)
- [ ] T002 Inicializar `apps/api`: Node 22 + TypeScript 5 + Fastify + Prisma + Zod + pg_boss (apps/api/package.json, tsconfig.json, src/index.ts vazio)
- [ ] T003 Inicializar `apps/mobile`: Expo SDK managed + expo-router + TypeScript (apps/mobile/package.json, app.json, app/_layout.tsx)
- [ ] T004 [P] Configurar ESLint + Prettier compartilhados no monorepo (eslint.config.js, .prettierrc na raiz)
- [ ] T005 [P] docker-compose com PostgreSQL 16 para dev e banco efêmero de teste (docker-compose.yml)
- [ ] T006 [P] Configuração de ambiente validada com Zod — nunca commitar secrets (apps/api/src/lib/config.ts, apps/api/.env.example)
- [ ] T007 [P] Setup de testes: Vitest na API (unit/integration/contract com banco efêmero) e Jest + Testing Library no mobile (apps/api/vitest.config.ts, apps/mobile/jest.config.js)
- [ ] T008 [P] CI mínima: lint + testes nos dois apps (.github/workflows/ci.yml)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: infraestrutura da qual TODAS as stories dependem — auth, banco, catálogo base, libs de dinheiro/auditoria

**⚠️ CRITICAL**: nenhuma story começa antes desta fase completa

- [ ] T009 Prisma schema inicial + framework de migrations: card_set, card, card_translation (com índices pg_trgm/GIN do data-model), user_profile, collection_visibility (apps/api/src/db/schema.prisma, migrations/)
- [ ] T010 Bootstrap Fastify: server, registro de módulos, error handler padrão `{error:{code,message}}` com códigos HTTP do contrato (apps/api/src/app.ts, src/lib/errors.ts)
- [ ] T011 Auth Supabase: verificação de JWT `Authorization: Bearer`, decorator de usuário, suporte a claim de papel `admin` (apps/api/src/modules/auth/plugin.ts)
- [ ] T012 [P] Lib de dinheiro em centavos inteiros (nunca float) com testes de unidade (apps/api/src/lib/money.ts, tests/unit/money.test.ts)
- [ ] T013 [P] Middleware de idempotência por header `Idempotency-Key` para rotas 💰 (apps/api/src/lib/idempotency.ts)
- [ ] T014 [P] Audit writer + migration de `financial_audit_log` append-only com REVOKE de UPDATE/DELETE (apps/api/src/lib/audit.ts, migration)
- [ ] T015 Runner pg_boss e registro de jobs no mesmo processo da API (apps/api/src/jobs/index.ts)
- [ ] T016 `CatalogProvider` adapter isolado: pokemontcg.io (EN, canônico) + TCGdex (PT, casado por set/número) com testes de contrato por fixtures (apps/api/src/integrations/catalog/, tests/contract/catalog.test.ts)
- [ ] T017 Job `catalog-sync` diário: sincroniza catálogo multilíngue completo para o Postgres (apps/api/src/jobs/catalog-sync.ts)
- [ ] T018 Proxy de imagens com cache em Cloudflare R2 + job `image-backfill` priorizado (edições recentes/populares → coleções/wishlists/anúncios → restante; thumbnails antes) (apps/api/src/integrations/storage/r2.ts, src/modules/catalog/images.ts, src/jobs/image-backfill.ts)
- [ ] T019 Mobile: cliente da API REST tipado + sessão de auth Supabase (apps/mobile/src/services/api.ts, src/services/auth.ts)
- [ ] T020 Mobile: componentes base com estados de loading/erro/retry e helpers de formatação BRL/datas (apps/mobile/src/components/, src/lib/format.ts)

**Checkpoint**: fundação pronta — stories podem começar (em paralelo, se houver equipe)

---

## Phase 3: User Story 1 — Contas e perfis (P1) 🎯 MVP

**Goal**: cadastro/login (e-mail + Google + Apple), visibilidade da coleção com link compartilhável, início do onboarding de vendedor

**Independent Test**: criar conta, logar/deslogar, alternar visibilidade (coleção mesmo vazia), gerar/revogar link, preencher cadastro de vendedor (status)

- [ ] T021 [US1] Configurar Supabase Auth: e-mail/senha + Google + Sign in with Apple, incluindo vinculação de conta social a e-mail existente (config Supabase + apps/api/docs/auth-setup.md)
- [ ] T022 [P] [US1] Endpoints GET/PATCH `/me` (perfil + preferências) (apps/api/src/modules/account/routes.ts)
- [ ] T023 [P] [US1] Endpoints GET/PUT `/me/visibility` + POST `/me/visibility/share-link` (gerar/revogar share_token não adivinhável) (apps/api/src/modules/account/visibility.ts)
- [ ] T024 [US1] Onboarding de vendedor: POST/GET `/me/seller` chamando `PaymentProvider.createRecipient` (interface + stub; adapter real na US6) e guardando apenas kyc_status (apps/api/src/modules/account/seller.ts, src/integrations/payments/provider.ts)
- [ ] T025 [US1] Mobile: telas de cadastro/login/social e logout (apps/mobile/app/(auth)/, src/features/account/)
- [ ] T026 [US1] Mobile: tela de perfil com visibilidade granular (cartas/valores/quantidades) e compartilhar link (apps/mobile/app/settings/visibility.tsx)
- [ ] T027 [US1] Teste de integração: fluxo conta → visibilidade → share-link → revogação (apps/api/tests/integration/account.test.ts)

**Checkpoint**: US1 funcional e testável isoladamente

---

## Phase 4: User Story 2 — Registro manual da coleção (P1) 🎯 MVP

**Goal**: buscar no catálogo com autocomplete multilíngue e manter a coleção (condição, idioma, variante, quantidade, preço de aquisição)

**Independent Test**: buscar carta (EN e PT), adicionar com atributos, ver na lista com imagem oficial, editar e remover; merge de duplicata por chave única

- [ ] T028 [P] [US2] Migration `collection_item` com UNIQUE(user, card, condition, language, variant) (apps/api/src/db/migrations/)
- [ ] T029 [P] [US2] Endpoint 🔓 GET `/catalog/cards` — busca única multilíngue com pg_trgm sobre card_translation (autocomplete; filtros completos na US10) (apps/api/src/modules/catalog/search.ts)
- [ ] T030 [US2] Endpoints da coleção: POST (merge por unique + `wishlist_matches[]` stub), PATCH/DELETE (regra 422/desativação entra na US6), GET `/collection` com filtros/ordenação (apps/api/src/modules/collection/routes.ts)
- [ ] T031 [US2] Mobile: busca com autocomplete e imagem no idioma (fallback EN) (apps/mobile/src/features/collection/search/)
- [ ] T032 [US2] Mobile: telas lista da coleção + adicionar/editar/remover item (validação de preço de aquisição > 0) (apps/mobile/app/collection/, src/features/collection/)
- [ ] T033 [US2] Teste de integração: adicionar/merge/editar/remover + busca <1s com catálogo sincronizado de fixtures (apps/api/tests/integration/collection.test.ts)

**Checkpoint**: MVP núcleo (US1+US2) completo — inventário digital funcional

---

## Phase 5: User Story 3 — Precificação automática (P2)

**Goal**: preço em BRL por carta com fonte + data, ciclos em dois níveis, fallback resiliente

**Independent Test**: cartas exibem preço BRL + fonte + data; com a fonte primária fora, o app segue operante com últimas cotações

- [ ] T034 [US3] 🚧 SPIKE (gate da coleta Liga): obter parecer legal sobre coleta da Liga Pokémon + redistribuição de imagens (pokemontcg.io/TCGdex); registrar resultado em specs/001-poketche-app/research.md §2/§8 — a coleta Liga permanece atrás de flag desligada até aprovação
- [ ] T035 [P] [US3] Migrations `card_price` (UNIQUE (card_id, condition, variant, source) NULLS NOT DISTINCT) + `card_price_snapshot` (apps/api/src/db/migrations/)
- [ ] T036 [US3] Interface `PriceProvider` + fonte internacional por carta (USD) + cliente PTAX/BACEN para conversão diária (apps/api/src/integrations/pricing/provider.ts, international.ts, ptax.ts)
- [ ] T037 [US3] `LigaPriceCollector` isolado atrás de flag: parser com fixtures, checks de sanidade, fallback automático — testes de contrato (apps/api/src/integrations/pricing/liga/, tests/contract/liga.test.ts)
- [ ] T038 [US3] Job `price-refresh` em dois níveis (diário prioritário: coleções/wishlists/anúncios + edições recentes; semanal rotativo p/ a cauda) + job `price-snapshot` após cada ciclo (apps/api/src/jobs/price-refresh.ts, price-snapshot.ts)
- [ ] T039 [US3] Testes de unidade obrigatórios (constituição I): upsert de cotação, conversão PTAX, seleção de fonte/fallback, sanidade (apps/api/tests/unit/pricing.test.ts)
- [ ] T040 [US3] Preço + fonte + data na coleção e no item; itens sem preço excluídos do total com indicação (API em `/collection`; apps/mobile/src/features/pricing/)
- [ ] T041 [US3] Teste de integração: primária fora por flag → ciclo completa via fallback e última cotação preservada (apps/api/tests/integration/pricing-fallback.test.ts)

**Checkpoint**: coleção precificada com resiliência de fontes

---

## Phase 6: User Story 8 — Estatísticas e histórico por carta (P3)

**Goal**: detalhe da carta com gráfico, variações por período, maior/menor, ganho/perda vs. aquisição, tendência

**Independent Test**: com ≥2 snapshots, detalhe mostra gráfico e variações; com <2, "histórico indisponível"; ganho/perda exato

- [ ] T042 [P] [US8] Endpoint GET `/collection/items/:id/details` — variações 7/30/90d/desde-adição, maior/menor, valor da posição, ganho/perda (apps/api/src/modules/collection/details.ts)
- [ ] T043 [P] [US8] Endpoint 🔓 GET `/catalog/cards/:id/price-history?period=` a partir dos snapshots (apps/api/src/modules/catalog/price-history.ts)
- [ ] T044 [US8] Testes de unidade: cálculo de variações, lacunas sem interpolação, ganho/perda (apps/api/tests/unit/variations.test.ts)
- [ ] T045 [US8] Mobile: tela de detalhes com gráfico + indicadores de tendência na listagem da coleção (apps/mobile/app/collection/[itemId].tsx, src/features/pricing/history/)

**Checkpoint**: análise por carta completa

---

## Phase 7: User Story 4 — Estatísticas da coleção (P3)

**Goal**: dashboard com valor total, evolução, distribuições, rankings e completude

**Independent Test**: total = Σ preço×quantidade; gráficos e completude batem com fixtures

- [ ] T046 [P] [US4] Job `collection-value-snapshot` diário + migration (apps/api/src/jobs/collection-value-snapshot.ts, migration)
- [ ] T047 [US4] Endpoints `/stats/overview|history|distribution|rankings|completion` (apps/api/src/modules/stats/routes.ts)
- [ ] T048 [US4] Mobile: dashboard com gráficos e rankings (apps/mobile/app/dashboard/, src/features/stats/)
- [ ] T049 [US4] Teste de integração: stats vs. fixtures (total, distribuições, rankings, completude) (apps/api/tests/integration/stats.test.ts)

**Checkpoint**: dashboard funcional

---

## Phase 8: User Story 7 — Acesso de visitante (P3)

**Goal**: visão pública de coleção via link respeitando visibilidade; ações restritas conduzem ao cadastro com retorno ao contexto

**Independent Test**: abrir link sem sessão → visão conforme configuração do dono; revogado → 404 opaco; ação restrita → cadastro → retorno

- [ ] T050 [US7] Endpoint 🔓 GET `/public/collections/:shareToken` aplicando show_cards/values/quantities; 404 opaco quando revogado/privado (apps/api/src/modules/collection/public.ts)
- [ ] T051 [US7] Mobile: tela pública somente leitura + deep link do share link (apps/mobile/app/public/[shareToken].tsx)
- [ ] T052 [US7] Mobile: guard de navegação — ação restrita sem sessão → cadastro/login → retorno ao ponto de origem (apps/mobile/src/services/auth-guard.ts)
- [ ] T053 [US7] Teste de integração: matriz de visibilidade + revogação (apps/api/tests/integration/public-collection.test.ts)

**Checkpoint**: compartilhamento público seguro

---

## Phase 9: User Story 10 — Explorador de Catálogo (P3)

**Goal**: navegação pública do catálogo completo (edições → grade → detalhe), busca com filtros, completude navegável

**Independent Test**: sem conta, edições → grade → detalhe com preço/histórico em ≤3 toques; com conta, posse/ações rápidas/completude

- [ ] T054 [P] [US10] Endpoints 🔓 `/catalog/sets`, `/catalog/sets/:id/cards` (paginado), `/catalog/cards/:id` — todos com Cache-Control + ETag invalidados pelo sync (apps/api/src/modules/catalog/explorer.ts)
- [ ] T055 [P] [US10] Estender GET `/catalog/cards` com filtros edição/raridade/tipo/faixa de preço (sem cotação fora do filtro com indicação) + índices de apoio (apps/api/src/modules/catalog/search.ts, migration de índices)
- [ ] T056 [US10] Endpoints autenticados: `/catalog/sets/:id/completion` (possuídas/faltantes + atalho lote wishlist) e `/catalog/cards/:id/listings` — posse fora dos payloads cacheáveis (apps/api/src/modules/catalog/completion.ts)
- [ ] T057 [US10] Mobile: telas do explorador — lista de edições (logo/data/total), grade progressiva, detalhe público (apps/mobile/app/explore/, src/features/catalog/)
- [ ] T058 [US10] Mobile: indicador de posse + ações rápidas + visão de completude com atalho p/ wishlist (apps/mobile/src/features/catalog/completion/)
- [ ] T059 [US10] Teste de integração: busca com filtros <1s, cache ETag, visitante sem dados de posse (apps/api/tests/integration/explorer.test.ts)

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
