# Implementation Plan: PokeTche — App de Coleção e Marketplace de Pokémon TCG

**Branch**: `001-poketche-app` | **Date**: 2026-07-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-poketche-app/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

App mobile (iOS/Android) para colecionadores de Pokémon TCG no Brasil: registro de coleção
com catálogo e autocomplete, precificação automática em BRL com histórico por carta,
dashboard de estatísticas, wishlists com preço-alvo e notificações, scanner de cartas por
câmera com sessões/gravação, e marketplace com pagamento em custódia (Pix + cartão) e
comissão via split. Abordagem técnica: app React Native/Expo, API REST em Node.js +
TypeScript, PostgreSQL; integrações externas (catálogo, preços, pagamentos, auth, push)
isoladas em camadas de adapter com cache e fallback, conforme a constituição do projeto.

## Technical Context

**Language/Version**: TypeScript 5.x — app: React Native com Expo SDK (managed workflow); backend: Node.js 22 LTS

**Primary Dependencies**: Expo (expo-camera / react-native-vision-camera, expo-notifications), Fastify (API REST), Prisma (ORM), Zod (validação), pg_boss (jobs agendados sobre Postgres)

**Storage**: PostgreSQL 16 (dados próprios + cache de catálogo e cotações + snapshots de preço); imagens de cartas servidas pelas URLs da fonte de catálogo (sem re-hospedagem no MVP)

**Testing**: Vitest (unidade e integração no backend; obrigatório para preços, transações e comissões), Testing Library/Jest para componentes críticos do app; testes de integração da API com banco efêmero

**Target Platform**: iOS 15+ e Android 8+ (via Expo); backend em Linux (PaaS)

**Project Type**: mobile-app + api (monorepo com `apps/mobile` e `apps/api`)

**Performance Goals**: autocomplete < 1 s (SC-003); abertura de link público < 5 s (SC-012); captura do scanner ≤ 2 s por carta (SC-006a); ciclo diário de cotações cobre 100% do catálogo com preço (SC-004/SC-016)

**Constraints**: dinheiro em centavos inteiros (nunca float); operações financeiras idempotentes com trilha de auditoria imutável; app plenamente utilizável sem câmera; vídeos de sessão nunca saem do dispositivo; LGPD (KYC delegado ao provedor de pagamentos)

**Scale/Scope**: ~10k usuários no ano 1, coleções de até ~10k cartas, ~1k anúncios ativos (clarificação de 2026-07-10); catálogo ~20k cartas

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Avaliação | Status |
|-----------|-----------|--------|
| I. Qualidade Testada | Testes automatizados planejados para precificação, transações e comissões (Vitest + banco efêmero); user story só é "done" com lógica crítica coberta | PASS |
| II. Simplicidade Primeiro | Só serviços gerenciados/estabelecidos: Expo, Fastify, Prisma, Supabase Auth, Expo Notifications, Pagar.me; sem microserviços, um ambiente de produção; nenhuma implementação própria de pagamento/auth/push | PASS |
| III. MVP Incremental | Stories independentes (US1→US9); scanner (US5) isolado com fluxo manual garantido; ordem de entrega P1→P5 | PASS |
| IV. Dinheiro é Crítico | Split e custódia no provedor de pagamentos (nunca processamento próprio); centavos inteiros; idempotência por chave; tabela de auditoria append-only; webhooks assinados | PASS |
| V. Isolamento de Dados de Terceiros | Adapters próprios para catálogo (`CatalogProvider`), preços (`PriceProvider`), pagamentos (`PaymentProvider`); cache em Postgres com TTL; fallback = última cotação conhecida | PASS |
| VI. UX Mobile-First | App Expo único para iOS/Android; estados de loading/erro/retry em todas as telas; fluxos curtos | PASS |

**Re-check pós-design (Phase 1)**: PASS — o data model usa centavos inteiros e estados explícitos
de pedido/disputa; os contratos incluem chaves de idempotência nas rotas financeiras; nenhuma
violação a justificar (Complexity Tracking vazio).

## Project Structure

### Documentation (this feature)

```text
specs/001-poketche-app/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   └── rest-api.md
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
apps/
├── mobile/                      # React Native + Expo
│   ├── app/                     # rotas (expo-router): auth, coleção, carta, dashboard,
│   │                            # wishlists, scanner, marketplace, público (link compartilhado)
│   ├── src/
│   │   ├── components/          # UI compartilhada (cards, listas, gráficos, estados de erro/loading)
│   │   ├── features/            # por domínio: collection/, pricing/, stats/, wishlist/,
│   │   │                        # scanner/ (sessão, molduras, gravação), marketplace/, account/
│   │   ├── services/            # cliente da API REST, auth, push, storage local (sessões pendentes, vídeo)
│   │   └── lib/                 # formatação BRL, datas, helpers
│   └── tests/
└── api/                         # Node.js + TypeScript (Fastify)
    ├── src/
    │   ├── modules/             # por domínio: auth/, catalog/, collection/, pricing/,
    │   │                        # stats/, wishlist/, scanner/ (identificação), marketplace/,
    │   │                        # notifications/, audit/
    │   ├── integrations/        # adapters isolados (constituição V):
    │   │   ├── catalog/         # CatalogProvider → pokemontcg.io (+ sync p/ Postgres)
    │   │   ├── pricing/         # PriceProvider → fonte BR / fallback USD+câmbio
    │   │   ├── payments/        # PaymentProvider → Pagar.me (split, Pix, cartão, KYC)
    │   │   └── push/            # Expo Notifications
    │   ├── jobs/                # pg_boss: sync catálogo, cotações diárias, snapshots,
    │   │                        # avaliação de wishlist, liberação automática, prazos
    │   ├── db/                  # Prisma schema + migrations
    │   └── lib/                 # money (centavos), idempotency, audit writer
    └── tests/
        ├── unit/                # preços, comissão, variações, regras de wishlist
        ├── integration/         # fluxos de pedido/pagamento (provedor mockado), API
        └── contract/            # contratos dos adapters externos
```

**Structure Decision**: monorepo com dois apps (`apps/mobile`, `apps/api`) — corresponde à
Option 3 (Mobile + API) do template. Sem pacotes compartilhados no MVP além de tipos gerados
do contrato da API; jobs rodam no mesmo processo/deploy da API (sem microserviços).

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

Nenhuma violação — tabela vazia.
