# Quickstart — Validação: Coleções Personalizadas

Roteiro para provar a feature ponta-a-ponta. Referências de detalhe: [data-model.md](./data-model.md), [contracts/rest-api.md](./contracts/rest-api.md).

## Pré-requisitos

- API rodando localmente (`pnpm --filter api dev`) com Postgres e a migração aplicada (`pnpm --filter api prisma migrate dev`).
- Catálogo carregado (job `catalog-sync`, ver [[catalog-sync-workflow]]) e um usuário autenticado com **inventário populado** (alguns `collection_item`, incluindo ao menos um item com preço e um sem preço).
- App mobile via USB/adb reverse conforme [[usb-android-run-setup]], ou chamadas diretas à API com Bearer token.

## Cenário 1 — CRUD (US1) e isolamento do inventário

1. `POST /collections { "name": "Favoritas" }` → 201, `summary` zerado.
2. `GET /collections` → a pasta aparece com contagem `0 cartas · 0 unidades`, valor `0`.
3. `PATCH /collections/:id { "name": "Top 10" }` → nome atualizado.
4. Anote a contagem/valor do inventário completo via `GET /collection` (`summary`).
5. `DELETE /collections/:id` → `{ deleted: true }`.
6. `GET /collection` de novo → **`summary` idêntico** ao do passo 4 (SC-003).

**Esperado**: criar/renomear/excluir pasta não altera o inventário completo.

## Cenário 2 — Vínculos muitos-para-muitos (US2)

1. Crie duas pastas: "Só Charizards" e "Favoritas".
2. Escolha um `collection_item_id` do inventário (via `GET /collection`).
3. `POST /collections/{charizards}/items { "collection_item_id": X }` → 201.
4. `POST /collections/{favoritas}/items { "collection_item_id": X }` → 201.
5. `POST /collections/{charizards}/items { "collection_item_id": X }` de novo → 201 idempotente (sem duplicar).
6. `GET /collection` → o item X aparece **1×** e a contagem/valor do inventário não muda (SC-002).
7. `DELETE /collections/{charizards}/items/X` → item some do recorte de Charizards, permanece em Favoritas e no inventário.

**Esperado**: vínculo é referência, não cópia; idempotente; remoção não afeta inventário nem outras pastas.

## Cenário 3 — Recorte com estatísticas próprias (US3)

1. Numa pasta com itens de **preço conhecido**, `GET /collections/:id`.
2. Confira `summary.total_cents` == Σ (preço atual × quantidade) dos itens vinculados (cálculo manual) — SC-004.
3. Confira `summary.distinct_cards` e `summary.total_quantity` (contagem em duas medidas, clarificação).
4. Inclua na pasta um item **sem preço** → ele aparece em `unpriced_items`, fora do `total_cents`.
5. Compare com o dashboard: `GET /stats/overview` do inventário completo **não muda** ao criar/excluir pastas ou mover cartas (SC-005).
6. Altere a quantidade de um item no inventário (`PATCH /collection/items/:id`) → `GET /collections/:id` reflete o novo valor do recorte.

**Esperado**: valor de recorte usa a mesma valoração da US4; dashboard geral intacto.

## Cenário 4 — Hub e listagem reusada (US4)

1. `GET /collections` → todas as pastas com nome, contagem (distinct·unidades) e valor.
2. No app: a tela principal de Coleção mostra o **hub** (pastas + acesso ao inventário completo).
3. Abrir uma pasta usa a **mesma** listagem/row/busca do inventário (só a fonte muda).
4. Abrir "inventário completo" leva à listagem completa já existente, inalterada.

**Esperado**: nenhuma tela de listagem paralela; apresentação idêntica à do inventário.

## Cenário 5 — Compartilhamento por link (US5)

1. `PUT /collections/:id/visibility { "show_cards": true, "show_values": true, "show_quantities": true }`.
2. `POST /collections/:id/share-link { "action": "generate" }` → recebe `share_url`/`share_token`.
3. Em sessão **não autenticada**: `GET /public/custom-collections/:shareToken` → só o recorte daquela pasta, respeitando as flags; sem `acquisition_price`, sem id de item, sem trend; `Cache-Control: no-store`.
4. Confirme que não há acesso ao inventário completo nem a outras pastas por esse link.
5. `POST /collections/:id/share-link { "action": "revoke" }` → `GET /public/custom-collections/:oldToken` passa a `404` opaco.
6. Gere o link de novo, depois `DELETE /collections/:id` → o link para de funcionar (SC-007).

**Esperado**: link específico por pasta, revogável; visão pública isolada ao recorte.

## Testes automatizados (constituição I)

Adicionar testes de integração no padrão de `apps/api` (Vitest + `buildApp({ prismaClient, authOverride })`), cobrindo no mínimo:
- CRUD + escopo de posse (404 opaco para pasta de outro usuário).
- Vínculo idempotente; remoção não afeta inventário; carta em N pastas conta 1× no inventário.
- Cascata: remover `collection_item` remove vínculos; excluir pasta não toca em `collection_item`.
- Recorte: `summary` do recorte == `overview()` manual; dashboard geral inalterado após operações de pasta (regressão US4).
- Sharing: gerar/revogar; visão pública respeita flags; token revogado/pasta excluída → 404.

## Comandos úteis

```bash
pnpm --filter api prisma migrate dev --name custom_collections   # cria a migração
pnpm --filter api test                                           # testes de integração da API
pnpm --filter api dev                                            # sobe a API local
```
