# Phase 1 — API Contract: Coleções Personalizadas

Prefixo `/api/v1`. JSON snake_case. Auth via `requireAuth` (Bearer Supabase) em tudo, **exceto** a rota pública. Erros no envelope padrão `{ error: { code, message } }` (`lib/errors.ts`). Valores em centavos inteiros.

Convenções reusadas: item do recorte tem o **mesmo shape** de `GET /collection` (serializer `serialize` reusado); resumo tem o shape de `overview()` (US4); sharing espelha `PUT /me/visibility` + `POST /me/visibility/share-link` (US7).

---

## US1 — CRUD de coleções

### `GET /collections`
Hub: lista as coleções do usuário com resumo de recorte.
```json
{
  "collections": [
    {
      "id": "uuid",
      "name": "Só Charizards",
      "summary": {
        "total_cents": 123400,
        "priced_items": 5,
        "unpriced_items": 1,
        "distinct_cards": 4,
        "total_quantity": 8
      },
      "shared": true,
      "created_at": "2026-07-20T12:00:00Z"
    }
  ]
}
```
- `summary` calculado via `overview()` sobre os itens vinculados de cada pasta (um carregamento agregado por usuário, sem N+1). `shared = status === 'public_link'`.

### `POST /collections`  → 201
Body: `{ "name": "Favoritas" }` (1–60 chars, trim). Retorna a coleção criada com `summary` zerado (`0/0/0/0/0`).
- Erros: `422` nome inválido (vazio/só espaços/>60).

### `PATCH /collections/:id`
Body: `{ "name": "Top 10" }`. Renomeia. Não afeta vínculos.
- Erros: `404` pasta de outro/inexistente (opaco); `422` nome inválido.

### `DELETE /collections/:id`  → `{ "deleted": true }`
Exclui a pasta; cascata remove só os vínculos. **Nunca** toca em `collection_item`. Se compartilhada, o link deixa de funcionar (token some com a linha).
- Erros: `404` pasta de outro/inexistente.

---

## US2 — Gerenciar vínculos (cartas do recorte)

### `POST /collections/:id/items`  → 201
Body: `{ "collection_item_id": "uuid" }`. Vincula um item do inventário do próprio usuário à pasta. Idempotente (revincular = sucesso, sem duplicar).
```json
{ "linked": true, "collection_item_id": "uuid" }
```
- Validações: pasta pertence ao usuário; `collection_item_id` pertence ao usuário (`ownedCollection()` + checagem de posse do item). 
- Erros: `404` pasta ou item não pertencem ao usuário / inexistentes (opaco).

### `DELETE /collections/:id/items/:collectionItemId`  → `{ "unlinked": true }`
Remove o vínculo daquele item de inventário na pasta. Não afeta o inventário nem vínculos em outras pastas.
- Erros: `404` pasta de outro/inexistente. Item não vinculado → também `{ "unlinked": true }` (idempotente) ou `404` do vínculo; escolher idempotente para simplificar o app.

---

## US3/US4 — Recorte com estatísticas próprias

### `GET /collections/:id?sort=recent|oldest`
Abre o recorte: itens (mesma apresentação do inventário) + resumo.
```json
{
  "id": "uuid",
  "name": "Só Charizards",
  "shared": false,
  "items": [ /* mesmo objeto de GET /collection: id, condition, language, variant,
                 quantity, acquisition_price_cents, added_at, price, position_value_cents,
                 trend, card{...} */ ],
  "summary": {
    "total_cents": 123400,
    "priced_items": 5,
    "unpriced_items": 1,
    "distinct_cards": 4,
    "total_quantity": 8
  }
}
```
- `items`: os `collection_item` vinculados, serializados por `serialize()` (reuso), ordenados por `added_at` conforme `sort` (default `recent`) — mesma semântica de `GET /collection`.
- `summary`: `overview()` (reuso US4) sobre os itens vinculados.
- Busca/apresentação: reusadas no cliente sobre `items` (mesma UI do inventário).
- Erros: `404` pasta de outro/inexistente.

---

## US5 — Compartilhamento público por coleção

### `PUT /collections/:id/visibility`
Ajusta as flags de exibição da pasta (parcial). Espelha `PUT /me/visibility`.
Body (todos opcionais): `{ "show_cards": true, "show_values": false, "show_quantities": false }`.
Retorna o estado de compartilhamento serializado (abaixo).

### `POST /collections/:id/share-link`
Body: `{ "action": "generate" | "revoke" }` (default `generate`). Gera/revoga o link público da pasta (reusa `generateShareToken()`).
Resposta (serializer no padrão US7):
```json
{
  "status": "public_link",
  "show_cards": true,
  "show_values": false,
  "show_quantities": false,
  "share_token": "opaco",
  "share_url": "https://.../opaco"
}
```
- `revoke` → `status: "private"`, `share_token: null`, `share_url: null`.
- Erros: `404` pasta de outro/inexistente.

### `GET /public/custom-collections/:shareToken`  🔓 sem auth
Visão pública somente-leitura do recorte compartilhado. Reusa a renderização de `collection/public.ts` (`publicItem`/`buildSummary`), aplicada aos itens vinculados da pasta. Respeita as flags. `Cache-Control: no-store`. 404 opaco para token inexistente/revogado/pasta privada.
```json
{
  "owner": { "display_name": "Simon" },
  "collection": { "name": "Só Charizards" },
  "visibility": { "show_cards": true, "show_values": false, "show_quantities": false },
  "stats": { "distinct_cards": 4, "sets": 2, "total_cards": null },
  "summary": null,
  "items": [ /* publicItem: sem acquisition_price, sem id de item, sem trend */ ]
}
```
- Caminho distinto de `GET /public/collections/:shareToken` (US7, coleção inteira) para não colidir.

---

## Resumo de reuso por endpoint

| Endpoint | Reusa |
|---|---|
| `GET /collections`, `GET /collections/:id` | `overview()` (US4), `serialize()`+`includeCard` (US2) |
| `POST/PATCH/DELETE /collections`, itens | `ownedCollection()`≈`ownedWishlist()`, `ensureProfile`, `notFound`/`conflict` |
| `PUT visibility`, `POST share-link` | enum `VisibilityStatus`, `generateShareToken()`, serializer de share (US7) |
| `GET /public/custom-collections/:token` | `publicItem`/`buildSummary` (US7), `localize`, `selectCurrentPrice` |
