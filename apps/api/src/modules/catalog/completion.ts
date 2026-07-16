import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { notFound } from '../../lib/errors.js';
import { completionPct } from '../stats/valuation.js';
import { setWhere } from './explorer.js';

/**
 * Posse e completude a partir do catálogo (T056, FR-071/FR-072). Estas rotas existem separadas
 * do explorador por um motivo estrutural: **são por usuário**, então não podem entrar nos
 * payloads com `ETag` — uma resposta cacheada de um colecionador serviria a outro. Sem cache e
 * autenticadas; o visitante simplesmente não as chama e não vê indicador de posse (FR-072).
 *
 * A grade (`/catalog/sets/:id/cards`) e a posse são compostas no cliente: o app sobrepõe os ids
 * possuídos sobre a grade cacheada.
 */

export function registerCatalogCompletion(app: FastifyInstance, prisma: PrismaClient): void {
  // Completude navegável da edição: quais o usuário possui e quais faltam (FR-072).
  app.get('/catalog/sets/:id/completion', { preHandler: app.requireAuth }, async (req) => {
    const { id } = req.params as { id: string };

    const set = await prisma.cardSet.findFirst({
      where: setWhere(id),
      select: { id: true, externalId: true, name: true, totalCards: true },
    });
    if (!set) throw notFound('edição não encontrada');

    const cards = await prisma.card.findMany({
      where: { setId: set.id },
      select: { id: true },
    });
    const items = await prisma.collectionItem.findMany({
      where: { userId: req.user!.id, card: { setId: set.id } },
      select: { cardId: true, quantity: true },
    });

    // Uma carta possuída em duas condições/idiomas/variantes conta **uma vez** na completude
    // (mesma regra do dashboard), mas a quantidade exibida soma as cópias (FR-071).
    const quantityByCard = new Map<string, number>();
    for (const item of items) {
      quantityByCard.set(item.cardId, (quantityByCard.get(item.cardId) ?? 0) + item.quantity);
    }
    const missing = cards.filter((c) => !quantityByCard.has(c.id)).map((c) => c.id);

    return {
      set: {
        id: set.id,
        external_id: set.externalId,
        name: set.name,
        total_cards: set.totalCards,
      },
      owned: quantityByCard.size,
      // `total` é o tamanho impresso da edição (mesma base do /stats/completion). Pode divergir
      // de `catalog_cards` enquanto o sync do catálogo estiver parcial — daí os dois campos.
      total: set.totalCards,
      pct: completionPct(quantityByCard.size, set.totalCards),
      catalog_cards: cards.length,
      owned_cards: [...quantityByCard].map(([card_id, quantity]) => ({ card_id, quantity })),
      /** Faltantes: alimentam o atalho em lote `POST /wishlists/:id/items { card_ids }` (US9). */
      missing_card_ids: missing,
    };
  });

  // 🔓 Anúncios ativos da carta — ação rápida do detalhe (FR-071). Público: o visitante navega
  // o marketplace sem conta (FR-026/US7). Fica fora do payload cacheável do detalhe porque
  // estoque e preço de anúncio mudam a cada compra, não no sync diário.
  app.get('/catalog/cards/:id/listings', async (req) => {
    const { id } = req.params as { id: string };
    const card = await prisma.card.findUnique({ where: { id }, select: { id: true } });
    if (!card) throw notFound('carta não encontrada');

    // A listing não aponta para a carta: o vínculo é card → collection_item → listing.
    // Enquanto a US6 não cria anúncios, isto responde [] — a ação rápida já pode existir na UI.
    const listings = await prisma.listing.findMany({
      where: { status: 'active', collectionItem: { cardId: id } },
      orderBy: { priceCents: 'asc' },
      select: {
        id: true,
        priceCents: true,
        shippingPriceCents: true,
        condition: true,
        language: true,
        variant: true,
        quantity: true,
        quantityReserved: true,
        quantitySold: true,
        seller: { select: { id: true, displayName: true } },
      },
    });

    return {
      card_id: id,
      listings: listings.map((l) => ({
        id: l.id,
        price_cents: l.priceCents,
        shipping_price_cents: l.shippingPriceCents,
        condition: l.condition,
        language: l.language,
        variant: l.variant,
        quantity_available: l.quantity - l.quantityReserved - l.quantitySold,
        seller: { id: l.seller.id, display_name: l.seller.displayName },
      })),
    };
  });
}
