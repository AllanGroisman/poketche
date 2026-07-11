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
| total_cards | int | base da completude (FR-020/FR-072) |
| release_date | date nullable | exibida no explorador (FR-068); placeholder se ausente |
| logo_url | text nullable | logo da edição no explorador (FR-068) |
| synced_at | timestamptz | controle do job de sync |

### card (Carta canônica do catálogo — agnóstica de idioma)
| Campo | Tipo | Notas |
|---|---|---|
| id | uuid | |
| external_id | text unique | id na fonte canônica (pokemontcg.io) |
| set_id | uuid FK → card_set | |
| number | text | número na edição; `(set, number)` identifica a carta unicamente (chave do OCR) |
| rarity | text | base dos tiers de feedback (FR-054) |
| supertype / subtypes / types | text / text[] | distribuições (FR-018) |
| synced_at | timestamptz | |

### card_translation (Localização por idioma — populada em EN e PT)
| Campo | Tipo | Notas |
|---|---|---|
| id | uuid | |
| card_id | uuid FK → card | |
| language | enum(en, pt) | UNIQUE(card_id, language); EN existe para 100% das cartas (fallback universal, FR-011) |
| name | text | nome localizado; indexado p/ autocomplete (trigram) — busca cobre todos os idiomas |
| image_small_url, image_large_url | text | arte localizada, servida da fonte (EN: pokemontcg.io; PT: TCGdex) |
| image_hash | text nullable | perceptual hash da arte localizada (fallback visual do scanner) |
| image_embedding | vector nullable | pgvector; só se o hashing se mostrar insuficiente (research §3) |
| source | enum(pokemontcgio, tcgdex) | proveniência da tradução |
| synced_at | timestamptz | |

Regra de exibição (FR-011): buscar `card_translation` no idioma do item; ausente → EN.

**Índices de busca do explorador (FR-069/SC-021)** — a modelagem cobre a busca multilíngue com
filtros sem tabelas novas: GIN `pg_trgm` em `card_translation.name` (nome em qualquer idioma);
b-tree em `card.set_id`, `card.rarity` e GIN em `card.types` (filtros); faixa de preço via join
com `card_price` (índice em `(card_id, price_cents)`), excluindo cartas sem cotação com indicação.
Imagens: URLs em `card_translation` apontam para o **proxy de imagens** próprio (cache em object
storage populado por backfill priorizado — ver plan.md); a URL da fonte fica registrada como origem.

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
| variant | enum(normal, reverse_foil, holo) default normal | variantes compartilham `(set, number)` mas têm preço distinto (research §3) |
| quantity | int > 0 | |
| acquisition_price_cents | int nullable, > 0 | FR-008/FR-040 |
| added_at | timestamptz | base da variação "desde a adição" |
| UNIQUE(user_id, card_id, condition, language, variant) | | FR-009 |

### card_price (Cotação vigente — 1 por carta[/condição] por fonte)
| Campo | Tipo | Notas |
|---|---|---|
| id | uuid | |
| card_id | uuid FK | |
| condition | enum nullable | quando a fonte diferencia |
| variant | enum(normal, reverse_foil, holo) default normal | preço por variante (fontes internacionais expõem normal/holo/reverse separadamente) |
| price_cents | int | |
| source | enum(liga_pokemon, intl_usd_fx) | fonte primária BR ou fallback internacional convertido; rótulo + data exibidos ao usuário (FR-012/FR-013); resolução do fallback é por carta |
| fx_rate | numeric nullable | PTAX usada, se conversão |
| fetched_at | timestamptz | "última atualização" (FR-013) |

`UNIQUE (card_id, condition, variant, source) NULLS NOT DISTINCT` (Postgres 16 — trata
`condition` nula como valor único, evitando duplicatas quando a fonte não diferencia condição).
O job de cotação faz **upsert** (`INSERT … ON CONFLICT … DO UPDATE SET price_cents, fx_rate,
fetched_at`): `card_price` guarda só a cotação vigente; o histórico vive em `card_price_snapshot`.

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
**Variantes**: a wishlist é no nível da **carta canônica** (sem escolher variante); o preço-alvo
é avaliado contra o **menor preço vigente entre as variantes** da carta, e a notificação e a
tela indicam **qual variante** atingiu o alvo (o indicador "atingiu o alvo" segue o mesmo preço).

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
| language_detected | boolean | idioma identificado automaticamente na captura (FR-067); indeterminado → `en` default |
| variant | enum(normal, reverse_foil, holo) default normal | não determinável pelo OCR; visual ou ajuste na revisão (research §3) |
| identification_method | enum(ocr, visual_match, manual) | qual etapa do `CardIdentifier` resolveu (research §3); `manual` = escolhido na revisão |

Transição: `confirm` da sessão cria/incrementa `collection_item` por captura resolvida e
dispara o fluxo de remoção de wishlist (FR-052/FR-058).

## Marketplace

### listing (Anúncio)
| Campo | Tipo | Notas |
|---|---|---|
| id, seller_id (user), collection_item_id | | quantidade anunciada ≤ possuída (FR-025) |
| price_cents | int > 0 | livre (assumption) |
| condition, language, variant | | desnormalizados p/ busca/filtros (FR-026) |
| quantity | int > 0 | total ofertado |
| quantity_reserved | int default 0 | unidades em pedidos `pending_payment` |
| quantity_sold | int default 0 | unidades em pedidos `paid` ou além |
| status | enum(active, sold, deactivated) | `sold` quando `quantity_sold = quantity` (FR-033) |

`CHECK (quantity_reserved >= 0 AND quantity_sold >= 0 AND quantity_reserved + quantity_sold <= quantity)`.
**Disponível** = `quantity − quantity_reserved − quantity_sold` (exposto no anúncio).

**Regras de estoque (anti-oversell)**:
- Compra parcial é permitida: o pedido tem `quantity` própria (1 ≤ n ≤ disponível).
- **Reserva** na criação do pedido: `UPDATE listing SET quantity_reserved = quantity_reserved + n
  WHERE id = :id AND quantity − quantity_reserved − quantity_sold >= n` — atômico (lock de linha);
  0 linhas afetadas ⇒ 409 para o comprador (compras simultâneas: só a primeira reserva vence,
  antes de qualquer cobrança).
- **Baixa/devolução**: pagamento aprovado ⇒ `reserved−n, sold+n`; pagamento falho/expirado ou
  pedido cancelado antes de `paid` ⇒ `reserved−n` (unidades voltam ao disponível).
- **Edição/remoção do collection_item vinculado**: reduzir quantidade da coleção abaixo do
  comprometido em anúncios ativos é bloqueada com orientação (ajustar/desativar o anúncio antes);
  remover o item desativa o anúncio (unidades disponíveis saem de oferta) — unidades já
  reservadas/vendidas **não são afetadas**, pois pedidos carregam snapshot próprio (abaixo).
- Desativar anúncio zera apenas a oferta futura; pedidos em andamento seguem seu fluxo.

### order (Pedido/Transação)
| Campo | Tipo | Notas |
|---|---|---|
| id, listing_id, buyer_id, seller_id | | `listing_id` é referência histórica; o pedido não depende do anúncio/item após criado |
| quantity | int > 0 | unidades compradas (compra parcial de anúncio com quantity > 1) |
| card_id, condition, language, variant | snapshot | copiados do anúncio na criação — edição/remoção posterior do anúncio ou do collection_item não afeta o pedido |
| status | enum(pending_payment, paid, shipped, received, released, cancelled, disputed, refunded) | máquina de estados abaixo |
| expires_at | timestamptz | prazo do `pending_payment` (janela de pagamento do provedor); expirado ⇒ cancela e devolve reserva |
| item_price_cents | int | preço unitário × quantity congelado no pedido |
| commission_cents, seller_net_cents | int | invariante: item = commission + net (SC-010) |
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

**Efeitos de estoque por transição** (na mesma transação da mudança de estado):
criar `pending_payment` ⇒ reserva n unidades no listing; `pending_payment → paid` ⇒
reserved−n / sold+n (e listing → `sold` se esgotou); `pending_payment → cancelled` (falha,
expiração por `expires_at` via job `order-deadlines`, ou desistência) ⇒ reserved−n (devolve ao
disponível); transições após `paid` não mexem em estoque (unidades já baixadas; reembolso não
recoloca à venda automaticamente).

### dispute (Disputa)
| id, order_id, opened_by, reason enum(not_received, not_as_described), status enum(open, resolved_buyer, resolved_seller), resolved_at, resolution_notes | | resolução humana (assumption); anexos na tabela abaixo |

### dispute_evidence (Anexos de disputa)
| Campo | Tipo | Notas |
|---|---|---|
| id, dispute_id FK, uploaded_by (user) | | uploaded_by ∈ {comprador, vendedor} da disputa |
| object_key | text | chave no **bucket R2 privado** `disputes/` — separado do cache público de imagens de catálogo |
| content_type, size_bytes | | fotos/imagens; validação de tipo e tamanho no upload |
| note | text nullable | descrição do anexo |

Acesso: nunca público — leitura via **URL assinada de curta duração**, emitida apenas para as
partes da disputa e para o papel `admin`; upload via URL assinada de escrita vinculada à disputa
aberta. Retenção: anexos preservados enquanto o pedido/auditoria existir (base de resolução).

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
