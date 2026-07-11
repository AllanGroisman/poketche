# REST API Contract: PokeTche (Phase 1)

**Base**: `/api/v1` — JSON; autenticação via JWT (Supabase) no header `Authorization: Bearer`.
Rotas marcadas 🔓 são públicas (visitante, FR-026/FR-003b). Rotas financeiras (💰) exigem
header `Idempotency-Key` e gravam auditoria. Erros: `{ error: { code, message } }` com HTTP
padrão (400 validação, 401/403 auth, 404, 409 conflito/estado inválido, 422 regra de negócio).

## Catálogo
| Método/Rota | Descrição |
|---|---|
| 🔓 GET `/catalog/cards?q=&set=&limit=` | Autocomplete/busca (nome, edição, número, imagem) — SC-003 |
| 🔓 GET `/catalog/cards/:id` | Detalhe da carta + preço vigente + histórico resumido (FR-043) |
| 🔓 GET `/catalog/cards/:id/price-history?period=7d|30d|90d|all` | Snapshots p/ gráfico (FR-038) |
| 🔓 GET `/catalog/sets` | Edições (totais p/ completude) |

## Conta e perfil
| Método/Rota | Descrição |
|---|---|
| GET/PATCH `/me` | Perfil + preferências (sons, câmera, auto-remoção de wishlist, push global) |
| GET/PUT `/me/visibility` | Configuração de visibilidade (status, show_cards/values/quantities) — FR-003/FR-003a |
| POST `/me/visibility/share-link` | Gera/revoga share_token |
| POST `/me/seller` | Inicia onboarding de vendedor → redireciona ao KYC do provedor (FR-004) |
| GET `/me/seller` | Status do KYC (pending/approved/rejected) |
| POST `/me/push-tokens` | Registra token Expo |

## Coleção
| Método/Rota | Descrição |
|---|---|
| GET `/collection?filter=&sort=` | Itens com preço vigente, valor da posição e tendência (FR-039/FR-041) |
| POST `/collection/items` | Adiciona item (card, condition, language, quantity, acquisition_price_cents?) — FR-008; merge por unique (FR-009); retorna `wishlist_matches[]` p/ pergunta de remoção (FR-052) |
| PATCH/DELETE `/collection/items/:id` | Edita/remove (FR-010) |
| GET `/collection/items/:id/details` | Tela de detalhes: preço atual, variações 7/30/90d/desde-adição, maior/menor, ganho/perda (FR-038–FR-040/FR-042) |

## Estatísticas
| Método/Rota | Descrição |
|---|---|
| GET `/stats/overview` | Valor total, itens sem preço (FR-016) |
| GET `/stats/history` | Evolução do valor (FR-017) |
| GET `/stats/distribution?by=set|rarity|type` | FR-018 |
| GET `/stats/rankings?type=top_value|gainers|losers|acquisition_pnl&period=` | FR-019/FR-020a |
| GET `/stats/completion` | Completude por edição (FR-020) |

## Visão pública (visitante)
| Método/Rota | Descrição |
|---|---|
| 🔓 GET `/public/collections/:shareToken` | Coleção pública respeitando visibilidade; 404 opaco se revogado (FR-003b/c) — SC-012 |

## Wishlists
| Método/Rota | Descrição |
|---|---|
| GET/POST `/wishlists`; PATCH/DELETE `/wishlists/:id` | CRUD + notifications_enabled (FR-044/FR-048) |
| POST/DELETE `/wishlists/:id/items(/:itemId)` | Itens com target_price_cents? (FR-045) |
| GET `/wishlists/:id` | Itens com preço atual, alvo, diferença, atingiu-alvo, já-na-coleção, anúncios ≤ alvo (FR-049–FR-051) |

## Scanner
| Método/Rota | Descrição |
|---|---|
| POST `/scan/sessions` | Cria sessão (409 se já houver pendente); PATCH p/ camera/recorded |
| POST `/scan/sessions/:id/captures` | Envia crop (imagem pequena) → `{status: identified|needs_review, card, candidates[], confidence}` (FR-022/FR-023) — SC-006a |
| PATCH/DELETE `/scan/sessions/:id/captures/:capId` | Resolver "a revisar", ajustar qty/condição/idioma, excluir (FR-056) |
| GET `/scan/sessions/:id/summary` | Resumo estatístico (FR-057) |
| POST `/scan/sessions/:id/confirm` | Adiciona à coleção + wishlist_matches (FR-058) |
| POST `/scan/sessions/:id/discard` | Descarta tudo |
| GET `/scan/sessions/pending` | Recuperação de sessão (FR-059) |

Nota: nenhum endpoint recebe vídeo — gravações nunca saem do dispositivo (FR-066).

## Marketplace
| Método/Rota | Descrição |
|---|---|
| 🔓 GET `/listings?q=&set=&condition=&language=&price_min=&price_max=` | Busca/filtros, visitante incluso (FR-026) |
| 🔓 GET `/listings/:id` | Detalhe + histórico de preço da carta (FR-043) |
| POST `/listings` | Cria anúncio (422 se quantity > possuída; exige KYC aprovado) (FR-025) |
| PATCH `/listings/:id` | Editar/desativar |
| 💰 POST `/orders` | Compra: `{listing_id, payment_method}` → cria pedido + cobrança no provedor (Pix QR/cartão); congela comissão; trava unidade (FR-027/FR-033) |
| GET `/orders/:id` · GET `/orders?role=buyer|seller` | Acompanhamento com estados e prazos |
| 💰 POST `/orders/:id/shipment` | Vendedor informa tracking_code → shipped (FR-029) |
| 💰 POST `/orders/:id/confirm-receipt` | Comprador confirma → released (split libera net ao vendedor) |
| 💰 POST `/orders/:id/cancel` | Cancelamento conforme estado/prazos (FR-031) |
| 💰 POST `/orders/:id/dispute` | Abre disputa, suspende liberação (FR-032) |
| POST `/orders/:id/review` | Avaliação 1–5 (FR-036) |
| 🔓 GET `/sellers/:id/reputation` | Reputação pública |

## Webhooks (entrada, assinados)
| Rota | Descrição |
|---|---|
| POST `/webhooks/payments` | Eventos do provedor (pagamento aprovado/recusado, transferência, reembolso) → transições de estado + auditoria; idempotente por `provider_event_id` |

## Jobs internos (sem rota; pg_boss)
`catalog-sync` (diário) · `price-refresh` (diário, FR-013) · `price-snapshot` (após refresh,
FR-037) · `collection-value-snapshot` (diário) · `wishlist-alerts` (após refresh, FR-046/047) ·
`order-deadlines` (liberação automática 7d pós-entrega, cancelamento por não-envio 5 dias úteis,
FR-030/031) · `payments-reconciliation` (reconciliação com o provedor).
