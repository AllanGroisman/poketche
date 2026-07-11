# REST API Contract: PokeTche (Phase 1)

**Base**: `/api/v1` — JSON; autenticação via JWT (Supabase) no header `Authorization: Bearer`.
Rotas marcadas 🔓 são públicas (visitante, FR-026/FR-003b). Rotas financeiras (💰) exigem
header `Idempotency-Key` e gravam auditoria. Erros: `{ error: { code, message } }` com HTTP
padrão (400 validação, 401/403 auth, 404, 409 conflito/estado inválido, 422 regra de negócio).

## Catálogo

> Rotas 🔓 de catálogo são as de maior tráfego (públicas): todas paginadas e servidas com
> `Cache-Control` + `ETag` (invalidação no sync diário); payloads não contêm dados por usuário.
| Método/Rota | Descrição |
|---|---|
| 🔓 GET `/catalog/cards?q=&set=&rarity=&type=&price_min=&price_max=&limit=&lang=` | Busca única (autocomplete e explorador) sobre nomes localizados de todos os idiomas (EN+PT), filtros combináveis; filtro de preço exclui cartas sem cotação com indicação (FR-069); resposta traz nome/imagem no idioma pedido com fallback EN (FR-011) — SC-003/SC-021 |
| 🔓 GET `/catalog/cards/:id?lang=` | Detalhe da carta (localizado, fallback EN, imagem em alta) + preço vigente com `{price_cents, source, fetched_at}` (FR-012/FR-013/FR-070) + histórico resumido (FR-043); payload público e cacheável — posse do usuário (FR-071) vem de `GET /collection/items?card_id=` |
| 🔓 GET `/catalog/cards/:id/price-history?period=7d|30d|90d|all` | Snapshots p/ gráfico (FR-038) |
| 🔓 GET `/catalog/sets` | Lista de edições: logo, data de lançamento, total de cartas (FR-068) |
| 🔓 GET `/catalog/sets/:id/cards?lang=&page=` | Grade da edição com thumbnails (paginada); payload público e cacheável — indicadores de posse (FR-072) vêm de `GET /catalog/sets/:id/completion` |
| GET `/catalog/sets/:id/completion` | Possuídas vs. faltantes da edição do usuário + atalho em lote p/ wishlist (FR-072) |
| 🔓 GET `/catalog/cards/:id/listings` | Anúncios ativos da carta (ação rápida do detalhe, FR-071) |

## Conta e perfil
| Método/Rota | Descrição |
|---|---|
| GET/PATCH `/me` | Perfil + preferências (sons, câmera, auto-remoção de wishlist, push global) |
| GET/PUT `/me/visibility` | Configuração de visibilidade (status, show_cards/values/quantities) — FR-003/FR-003a |
| POST `/me/visibility/share-link` | Gera/revoga share_token |
| POST `/me/seller` | Inicia onboarding de vendedor → redireciona ao KYC do provedor (FR-004) |
| GET `/me/seller` | Status do KYC (pending/approved/rejected) |
| POST `/me/push-tokens` | Registra token Expo |
| GET/POST `/me/addresses`; PATCH/DELETE `/me/addresses/:id` | Endereços de entrega salvos p/ reuso no checkout (FR-073); editar/remover não afeta pedidos (endereço congelado no pedido) |

## Coleção
| Método/Rota | Descrição |
|---|---|
| GET `/collection?filter=&sort=` | Itens com preço vigente, valor da posição e tendência (FR-039/FR-041) |
| POST `/collection/items` | Adiciona item (card, condition, language, quantity, acquisition_price_cents?) — FR-008; merge por unique (FR-009); retorna `wishlist_matches[]` p/ pergunta de remoção (FR-052) |
| PATCH/DELETE `/collection/items/:id` | Edita/remove (FR-010); 422 ao reduzir quantidade abaixo do comprometido em anúncios ativos; remoção desativa anúncios vinculados (pedidos em andamento não são afetados — snapshot no pedido) |
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
| POST `/scan/sessions/:id/captures` | Envia crop (imagem pequena) → `{status: identified|needs_review, card, candidates[], confidence, language: pt|en, language_detected: bool, variant: normal|reverse_foil|holo, method: ocr|visual_match}` — contrato do `CardIdentifier`: idioma automático (indeterminado → `en`), variante default `normal` quando não determinável, método trocável sem mudar o fluxo de sessões (FR-022/FR-023/FR-067) — SC-006a |
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
| 🔓 GET `/listings/:id` | Detalhe + frete (fixo ou "incluso") + histórico de preço da carta (FR-043/FR-075) |
| POST `/listings` | Cria anúncio com `shipping_price_cents` (0 = frete incluso) (422 se quantity > possuída; exige KYC aprovado) (FR-025) |
| PATCH `/listings/:id` | Editar/desativar |
| GET/POST `/cart/items`; PATCH/DELETE `/cart/items/:id` | Carrinho multi-vendedor (FR-082): adicionar anúncios com quantidade; não reserva estoque; GET revalida disponibilidade/preço e sinaliza itens alterados/indisponíveis |
| 💰 POST `/checkout` | Confirma o carrinho: `{payment_method, shipping_address_id | shipping_address}` (endereço salvo ou inline, com opção de salvar — FR-073; **congelado em cada pedido**, FR-074) → **reserva atômica** de todas as unidades em todas as listings (tudo ou nada; 409 apontando itens insuficientes — compras simultâneas perdem antes de qualquer cobrança), cria **um pedido por vendedor** (itens agrupados, frete = maior entre os anúncios do vendedor) em `pending_payment` com `expires_at` e snapshots + **cobrança única do total** no provedor com split multi-recebedor (Pix QR/cartão); congela comissão sobre os itens (FR-027/FR-028/FR-033/FR-075/FR-082) |
| GET `/orders/:id` · GET `/orders?role=buyer|seller` | Acompanhamento com estados, itens, prazos, transportadora/código/link de rastreamento; `shipping_address` só p/ comprador e vendedor do pedido enquanto em andamento (FR-074) |
| 💰 POST `/orders/:id/shipment` | Vendedor confirma envio: `{carrier: correios\|jadlog\|loggi\|other, carrier_name?, tracking_code}` — carrier e tracking obrigatórios (400 se ausentes; carrier_name exigido p/ other) → shipped (FR-029/FR-076) |
| 💰 POST `/orders/:id/confirm-receipt` | Comprador confirma → `received` e, na mesma transação, → `released` (split libera net = itens − comissão + frete ao vendedor, FR-028); `received_at` e `released_at` registrados, ambas as transições auditadas |
| 💰 POST `/orders/:id/cancel` | Comprador cancela livremente enquanto `paid` (não enviado); reembolso do total do pedido (itens + frete) — reembolso parcial da cobrança do checkout quando havia outros pedidos (FR-031/FR-077) |
| 💰 POST `/orders/:id/dispute` | Abre disputa, suspende liberação (FR-032) |
| POST `/disputes/:id/evidence` | Solicita URL assinada de upload (bucket R2 **privado**, separado do cache público) → registra anexo; partes da disputa apenas |
| GET `/disputes/:id/evidence` | Lista anexos com URLs assinadas de curta duração — acesso restrito às partes e ao papel `admin` |
| POST `/orders/:id/review` | Avaliação mútua 1–5: cada parte (comprador e vendedor) avalia a outra, uma por pedido (409 se repetida) (FR-036) |
| 🔓 GET `/users/:id/reputation` | Reputação pública — de vendedor (exibida nos anúncios/perfil) e de comprador (perfil) (FR-036) |

## Admin (papel `admin` no Supabase; back-office interno de disputas — US11)

> Todas as rotas exigem o papel `admin` (403 caso contrário — FR-078) e aplicam a regra de
> conflito de interesse: 403 se o admin for comprador ou vendedor do pedido (FR-081).

| Método/Rota | Descrição |
|---|---|
| GET `/admin/disputes?status=open|awaiting_parties` | Fila ordenada por abertura, com tempo decorrido vs. prazos-alvo (1º resposta 1 dia útil / resolução 7d — SC-023) |
| GET `/admin/disputes/:id` | Detalhes do pedido (item/frete/comissão, estados, prazos, endereço) + evidências das partes (FR-078) |
| POST `/admin/disputes/:id/request-info` | `{parties: [buyer|seller], note}` → notifica as partes com prazo de resposta (3d); disputa → `awaiting_parties`; expirado, decisão segue com o disponível (FR-080) |
| 💰 POST `/admin/disputes/:id/resolve` | `{outcome: refund_buyer | release_seller, notes}` → refund do total (item + frete) ou liberação do net via PaymentProvider + auditoria com `resolved_by` + notificação às partes (FR-032/FR-079) |

## Webhooks (entrada, assinados)
| Rota | Descrição |
|---|---|
| POST `/webhooks/payments` | Eventos do provedor (pagamento aprovado/recusado, transferência, reembolso) → transições de estado + auditoria; idempotente por `provider_event_id` |

## Jobs internos (sem rota; pg_boss)
`catalog-sync` (diário) · `image-backfill` (após sync; prioridade: thumbnails de edições
recentes/populares → cartas em coleções/wishlists/anúncios → restante) · `price-refresh`
(diário, FR-013) · `price-snapshot` (após refresh,
FR-037) · `collection-value-snapshot` (diário) · `wishlist-alerts` (após refresh, FR-046/047) ·
`order-deadlines` (expiração de checkouts `pending_payment` cancelando os pedidos do grupo e devolvendo todas as reservas aos anúncios; liberação
automática 21d corridos pós-postagem — sem integração de rastreio no MVP; cancelamento por
não-envio 5 dias úteis; expiração do prazo de resposta em disputas `awaiting_parties`,
FR-030/031/080) · `payments-reconciliation` (reconciliação com o provedor).
