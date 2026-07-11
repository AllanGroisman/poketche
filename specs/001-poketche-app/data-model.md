# Data Model: PokeTche (Phase 1)

**Date**: 2026-07-10 | **Plan**: [plan.md](./plan.md) | **Spec**: [spec.md](./spec.md)

Convenções: ids UUID; timestamps `created_at`/`updated_at` em todas as tabelas; valores
monetários **sempre em centavos inteiros (BRL)** com sufixo `_cents`; enums como tipos Postgres.

## Catálogo (dados de terceiros, sincronizados — somente leitura para o app)

### card_set (Edição/Coleção)
| Campo | Tipo | Notas |
|---|---|---|
| id | uuid | |
| external_id | text unique | id na fonte (pokemontcg.io) |
| name, series | text | |
| total_cards | int | base da completude (FR-020) |
| release_date | date | |
| synced_at | timestamptz | controle do job de sync |

### card (Carta do catálogo)
| Campo | Tipo | Notas |
|---|---|---|
| id | uuid | |
| external_id | text unique | |
| set_id | uuid FK → card_set | |
| name | text | indexado p/ autocomplete (trigram) |
| number | text | número na edição |
| rarity | text | base dos tiers de feedback (FR-054) |
| supertype / subtypes / types | text / text[] | distribuições (FR-018) |
| image_small_url, image_large_url | text | servidas da fonte |
| image_embedding | vector | pgvector; identificação do scanner |
| synced_at | timestamptz | |

## Identidade e privacidade

### user_profile (Usuário — auth delegada ao Supabase; aqui só o perfil)
| Campo | Tipo | Notas |
|---|---|---|
| id | uuid | = id do Supabase Auth |
| display_name | text | único dado exposto publicamente |
| notifications_enabled | boolean default true | toggle global (FR-048) |
| wishlist_auto_remove | boolean default false | FR-051 |
| scanner_sounds_enabled | boolean default true | FR-055 |
| preferred_camera | enum(back,front) default back | FR-061 |

### collection_visibility (Configuração de Visibilidade — 1:1 com user)
| Campo | Tipo | Notas |
|---|---|---|
| user_id | uuid PK FK | |
| status | enum(private, public_link) default private | FR-003 |
| share_token | text unique nullable | não adivinhável; nulo revoga o link (FR-003c) |
| show_cards / show_values / show_quantities | boolean | defaults: true/false/false (FR-003a; assumption) |

### seller_profile (Perfil de Vendedor)
| Campo | Tipo | Notas |
|---|---|---|
| user_id | uuid PK FK | |
| provider_recipient_id | text | id do recipient no Pagar.me |
| kyc_status | enum(pending, approved, rejected) | FR-004 — só status, nunca documentos |
| rating_avg, rating_count | numeric, int | reputação materializada (FR-036) |

## Coleção e preços

### collection_item (Item da Coleção)
| Campo | Tipo | Notas |
|---|---|---|
| id | uuid | |
| user_id, card_id | uuid FK | |
| condition | enum(mint, near_mint, excellent, good, played, damaged) | FR-008 |
| language | enum(pt, en) | |
| quantity | int > 0 | |
| acquisition_price_cents | int nullable, > 0 | FR-008/FR-040 |
| added_at | timestamptz | base da variação "desde a adição" |
| UNIQUE(user_id, card_id, condition, language) | | FR-009 |

### card_price (Cotação vigente — 1 por carta[/condição] por fonte)
| Campo | Tipo | Notas |
|---|---|---|
| id | uuid | |
| card_id | uuid FK | |
| condition | enum nullable | quando a fonte diferencia |
| price_cents | int | |
| source | enum(liga_pokemon, tcgplayer_fx) | rótulo exibido ao usuário |
| fx_rate | numeric nullable | PTAX usada, se conversão |
| fetched_at | timestamptz | "última atualização" (FR-013) |

### card_price_snapshot (Snapshot de Preço da Carta — histórico, FR-037)
Mesmos campos de `card_price` + índice `(card_id, fetched_at)`. Append-only; base de
gráficos, variações 7/30/90d, maior/menor, tendência (±5% em 7d) e rankings.

### collection_value_snapshot (Snapshot de Valor da Coleção)
| user_id, total_cents, priced_items, unpriced_items, taken_at | | diário; evolução (FR-017) |

## Wishlists

### wishlist
| id, user_id, name, notifications_enabled (FR-048) | | usuário pode ter várias (FR-044) |

### wishlist_item (Item de Wishlist)
| Campo | Tipo | Notas |
|---|---|---|
| id, wishlist_id, card_id | | UNIQUE(wishlist_id, card_id) |
| target_price_cents | int nullable, > 0 | FR-045 |
| alert_state | enum(armed, notified) | rearme (FR-047) |
| last_notified_at | timestamptz nullable | intervalo mínimo 24h (FR-047) |

Regra: avaliação por **carta** (não por item) — no máx. 1 notificação/carta/evento (FR-046).

## Scanner

### scan_session (Sessão de Escaneamento)
| Campo | Tipo | Notas |
|---|---|---|
| id, user_id | | máx. 1 sessão `pending` por usuário (assumption) |
| status | enum(active, pending, confirmed, discarded) | ciclo de vida |
| camera | enum(back, front) | FR-061 |
| recorded | boolean | vídeo fica só no dispositivo (FR-066) — nunca armazenado no servidor |
| confirmed_at / discarded_at | timestamptz | |

### scan_capture
| Campo | Tipo | Notas |
|---|---|---|
| id, session_id | | |
| card_id | uuid FK nullable | nulo enquanto "a revisar" |
| status | enum(identified, needs_review) | FR-022/FR-023 |
| candidates | jsonb | top-N alternativas com confiança |
| condition, language, quantity | | ajustáveis na revisão; duplicata = quantity++ (FR-053) |

Transição: `confirm` da sessão cria/incrementa `collection_item` por captura resolvida e
dispara o fluxo de remoção de wishlist (FR-052/FR-058).

## Marketplace

### listing (Anúncio)
| Campo | Tipo | Notas |
|---|---|---|
| id, seller_id (user), collection_item_id | | quantidade anunciada ≤ possuída (FR-025) |
| price_cents | int > 0 | livre (assumption) |
| condition, language, quantity | | desnormalizados p/ busca/filtros (FR-026) |
| status | enum(active, sold, deactivated) | FR-033 |

### order (Pedido/Transação)
| Campo | Tipo | Notas |
|---|---|---|
| id, listing_id, buyer_id, seller_id | | |
| status | enum(pending_payment, paid, shipped, received, released, cancelled, disputed, refunded) | máquina de estados abaixo |
| item_price_cents, commission_cents, seller_net_cents | int | invariante: item = commission + net (SC-010) |
| commission_pct | numeric | percentual vigente congelado no pedido |
| payment_method | enum(pix, credit_card) | FR-027 |
| provider_charge_id | text | referência no Pagar.me |
| idempotency_key | text unique | FR-034 |
| tracking_code | text nullable | FR-029 |
| paid_at / shipped_at / received_at / released_at | timestamptz | prazos: envio 5 dias úteis; liberação auto 7d pós-entrega |

**Estados**: `pending_payment → paid → shipped → received → released`;
`pending_payment → cancelled` (pagamento falho/expirado); `paid → cancelled+refunded`
(vendedor não enviou no prazo, FR-031); `shipped → disputed → refunded | released` (FR-032);
`shipped → released` (auto após prazo sem disputa, FR-030). Transições válidas impostas por
código + constraint; toda transição grava auditoria.

### dispute (Disputa)
| id, order_id, opened_by, reason enum(not_received, not_as_described), status enum(open, resolved_buyer, resolved_seller), evidence jsonb[], resolved_at | | resolução humana (assumption) |

### review (Avaliação)
| id, order_id unique, rater_id, rated_id, stars 1–5, comment | | atualiza rating materializado do vendedor |

### financial_audit_log (Registro de Auditoria — append-only, FR-035)
| Campo | Tipo | Notas |
|---|---|---|
| id bigserial | | sem UPDATE/DELETE (revogados por grant) |
| order_id, actor | | actor = user/system/webhook |
| action | text | payment_captured, released, refunded, commission_withheld… |
| amount_cents | int | |
| state_before, state_after | text | |
| provider_event_id | text nullable | correlação com webhook |
| created_at | timestamptz | |

## Push

### push_token
| user_id, expo_token unique, platform, last_seen_at | | Expo Notifications |
