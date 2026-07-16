import type { FastifyInstance } from 'fastify';
import type { CollectionVisibility, PrismaClient } from '@prisma/client';
import { notFound } from '../../lib/errors.js';
import { localize } from '../catalog/localize.js';
import { selectCurrentPrice, serializePrice, type PriceLike } from '../pricing/current.js';
import { includeCard, type ItemWithCard } from './routes.js';

/**
 * Visão pública de uma coleção compartilhada (T050, FR-003b/c, SC-012). Somente leitura e
 * sem sessão: o visitante vê exatamente o que o dono autorizou em FR-003a e nada além.
 *
 * Duas regras não óbvias:
 *   - **404 opaco**: token inexistente, revogado ou coleção privada são indistinguíveis —
 *     o status entra na cláusula da consulta, então não há caminho que revele conteúdo.
 *   - **Nunca cacheável**: mudanças de visibilidade valem imediatamente (FR-003a), e o link
 *     pode ser revogado a qualquer momento — nenhum intermediário pode reter esta resposta.
 *
 * Nada do payload privado do dono vaza: preço de aquisição, id do item e tendência ficam de
 * fora — a visão pública não é a listagem autenticada com campos apagados (LGPD, constituição).
 */

type VisibilityFlags = Pick<CollectionVisibility, 'showCards' | 'showValues' | 'showQuantities'>;

function publicItem(item: ItemWithCard, prices: PriceLike[], flags: VisibilityFlags) {
  const display = localize(item.card.translations, item.language);
  const price = flags.showValues ? selectCurrentPrice(prices, item) : null;
  return {
    condition: item.condition,
    language: item.language,
    variant: item.variant,
    // Quantidade só com autorização do dono (FR-003a, cenário 4).
    quantity: flags.showQuantities ? item.quantity : null,
    price: serializePrice(price),
    // O valor da posição revelaria a quantidade oculta (valor ÷ preço unitário): exige ambos.
    position_value_cents: price && flags.showQuantities ? price.priceCents * item.quantity : null,
    card: {
      id: item.card.id,
      external_id: item.card.externalId,
      number: item.card.number,
      rarity: item.card.rarity,
      set: { external_id: item.card.set.externalId, name: item.card.set.name },
      ...display,
    },
  };
}

/** Total e contagens agregados (FR-003b): só quando o dono autoriza valores (cenário 2/3). */
function buildSummary(items: ItemWithCard[], pricesByCard: Map<string, PriceLike[]>) {
  let totalCents = 0;
  let pricedItems = 0;
  let unpricedItems = 0;
  for (const item of items) {
    const price = selectCurrentPrice(pricesByCard.get(item.cardId) ?? [], item);
    if (price) {
      totalCents += price.priceCents * item.quantity;
      pricedItems++;
    } else {
      unpricedItems++;
    }
  }
  return { total_cents: totalCents, priced_items: pricedItems, unpriced_items: unpricedItems };
}

export function registerCollectionPublic(app: FastifyInstance, prisma: PrismaClient): void {
  // 🔓 sem preHandler: rota de visitante (FR-026).
  app.get('/public/collections/:shareToken', async (req, reply) => {
    const { shareToken } = req.params as { shareToken: string };
    const visibility = await prisma.collectionVisibility.findFirst({
      where: { shareToken, status: 'public_link' },
      include: { user: { select: { displayName: true } } },
    });
    if (!visibility) throw notFound('coleção não encontrada');

    const items = await prisma.collectionItem.findMany({
      where: { userId: visibility.userId },
      include: includeCard,
      orderBy: { addedAt: 'desc' },
    });

    // Cotações só entram na consulta quando o dono autoriza valores — o que não pode ser
    // exibido também não precisa ser lido.
    const cardIds = [...new Set(items.map((i) => i.cardId))];
    const prices =
      visibility.showValues && cardIds.length
        ? await prisma.cardPrice.findMany({ where: { cardId: { in: cardIds } } })
        : [];
    const pricesByCard = new Map<string, PriceLike[]>();
    for (const p of prices) {
      const list = pricesByCard.get(p.cardId) ?? [];
      list.push(p);
      pricesByCard.set(p.cardId, list);
    }

    // Estatísticas básicas (FR-003b) independem da lista: o dono pode ocultar as cartas e
    // ainda compartilhar o tamanho da coleção. `total_cards` soma quantidades — segue o flag.
    const stats = {
      distinct_cards: cardIds.length,
      sets: new Set(items.map((i) => i.card.set.externalId)).size,
      total_cards: visibility.showQuantities ? items.reduce((sum, i) => sum + i.quantity, 0) : null,
    };

    void reply.header('Cache-Control', 'no-store');

    return {
      owner: { display_name: visibility.user.displayName },
      visibility: {
        show_cards: visibility.showCards,
        show_values: visibility.showValues,
        show_quantities: visibility.showQuantities,
      },
      stats,
      summary: visibility.showValues ? buildSummary(items, pricesByCard) : null,
      items: visibility.showCards
        ? items.map((i) => publicItem(i, pricesByCard.get(i.cardId) ?? [], visibility))
        : [],
    };
  });
}
