import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { notFound } from '../../lib/errors.js';
import type { PriceLike } from '../pricing/current.js';
import { includeCard, type ItemWithCard } from '../collection/routes.js';
import { buildSummary, publicItem } from '../collection/public.js';

/**
 * Visão pública de uma coleção personalizada compartilhada (feature 002 — US5/FR-020/021).
 * Reusa a renderização da US7 (`publicItem`/`buildSummary`) aplicada apenas ao recorte da pasta,
 * com as mesmas garantias: 404 opaco (token inexistente/revogado indistinguíveis), nunca cacheável,
 * e nenhum dado privado do dono (preço de aquisição, id de item) no payload.
 */

export function registerCustomCollectionsPublic(app: FastifyInstance, prisma: PrismaClient): void {
  // 🔓 sem preHandler: rota de visitante. Caminho distinto de /public/collections/:token (US7).
  app.get('/public/custom-collections/:shareToken', async (req, reply) => {
    const { shareToken } = req.params as { shareToken: string };
    const collection = await prisma.collection.findFirst({
      where: { shareToken, status: 'public_link' },
      include: { user: { select: { displayName: true } } },
    });
    if (!collection) throw notFound('coleção não encontrada');

    const memberships = await prisma.collectionMembership.findMany({
      where: { collectionId: collection.id },
      orderBy: { collectionItem: { addedAt: 'desc' } },
      include: { collectionItem: { include: includeCard } },
    });
    const items: ItemWithCard[] = memberships.map((m) => m.collectionItem);

    // Cotações só entram quando o dono autoriza valores — o que não pode ser exibido não é lido.
    const cardIds = [...new Set(items.map((i) => i.cardId))];
    const prices =
      collection.showValues && cardIds.length
        ? await prisma.cardPrice.findMany({ where: { cardId: { in: cardIds } } })
        : [];
    const pricesByCard = new Map<string, PriceLike[]>();
    for (const p of prices) {
      const list = pricesByCard.get(p.cardId) ?? [];
      list.push(p);
      pricesByCard.set(p.cardId, list);
    }

    const stats = {
      distinct_cards: cardIds.length,
      sets: new Set(items.map((i) => i.card.set.externalId)).size,
      total_cards: collection.showQuantities ? items.reduce((sum, i) => sum + i.quantity, 0) : null,
    };

    void reply.header('Cache-Control', 'no-store');

    return {
      owner: { display_name: collection.user.displayName },
      collection: { name: collection.name },
      visibility: {
        show_cards: collection.showCards,
        show_values: collection.showValues,
        show_quantities: collection.showQuantities,
      },
      stats,
      summary: collection.showValues ? buildSummary(items, pricesByCard) : null,
      items: collection.showCards
        ? items.map((i) => publicItem(i, pricesByCard.get(i.cardId) ?? [], collection))
        : [],
    };
  });
}
