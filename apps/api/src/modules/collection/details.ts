import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { notFound } from '../../lib/errors.js';
import { localize } from '../catalog/localize.js';
import { selectCurrentPrice, serializePrice, type PriceLike } from '../pricing/current.js';
import {
  buildItemSeries,
  computeGainLoss,
  computeVariation,
  highLow,
  type PricePoint,
} from '../pricing/history.js';

/**
 * Tela de detalhes do item da coleção (T042, FR-038–FR-040/FR-042). Preço atual, valor da
 * posição, variações 7/30/90d, ganho/perda vs. aquisição (ou desde a adição) e a série do
 * gráfico a partir dos snapshots. Sem interpolar: períodos sem referência ficam `null` e
 * `history_available=false` sinaliza "histórico indisponível" (< 2 pontos).
 */

// Janela de snapshots carregada: cobre a variação de 90d + folga p/ a referência anterior.
const HISTORY_WINDOW_DAYS = 120;
const PERIODS = [7, 30, 90] as const;

function serializeSeries(points: PricePoint[]): { t: string; price_cents: number }[] {
  return points.map((p) => ({ t: p.t.toISOString(), price_cents: p.priceCents }));
}

export function registerCollectionDetails(app: FastifyInstance, prisma: PrismaClient): void {
  app.get('/collection/items/:id/details', { preHandler: app.requireAuth }, async (req) => {
    const { id } = req.params as { id: string };

    const item = await prisma.collectionItem.findFirst({
      where: { id, userId: req.user!.id },
      include: {
        card: {
          include: {
            set: { select: { externalId: true, name: true } },
            translations: { select: { id: true, language: true, name: true } },
          },
        },
      },
    });
    if (!item) throw notFound('item não encontrado');

    // Preço vigente (card_price) — mesma seleção da listagem, para consistência do "atual".
    const prices: PriceLike[] = await prisma.cardPrice.findMany({
      where: { cardId: item.cardId },
    });
    const current = selectCurrentPrice(prices, item);
    const currentCents = current?.priceCents ?? null;
    const positionValueCents = currentCents == null ? null : currentCents * item.quantity;

    // Histórico da carta na janela; recorta a série do item (variante + condição do item).
    const since = new Date(Date.now() - HISTORY_WINDOW_DAYS * 86_400_000);
    const snapshots = await prisma.cardPriceSnapshot.findMany({
      where: { cardId: item.cardId, fetchedAt: { gte: since } },
      select: { condition: true, variant: true, priceCents: true, source: true, fetchedAt: true },
    });
    const series = buildItemSeries(snapshots, item);

    const now = new Date();
    const variations = Object.fromEntries(
      PERIODS.map((d) => [`${d}d`, computeVariation(series, currentCents, d, now)]),
    );

    const display = localize(item.card.translations, item.language);

    return {
      item: {
        id: item.id,
        condition: item.condition,
        language: item.language,
        variant: item.variant,
        quantity: item.quantity,
        acquisition_price_cents: item.acquisitionPriceCents,
        added_at: item.addedAt,
      },
      current_price: serializePrice(current),
      position_value_cents: positionValueCents,
      history_available: series.length >= 2,
      snapshot_count: series.length,
      variations,
      gain_loss: computeGainLoss(series, currentCents, item.addedAt, item.acquisitionPriceCents),
      high_low: highLow(series),
      history: serializeSeries(series),
      card: {
        id: item.card.id,
        external_id: item.card.externalId,
        number: item.card.number,
        rarity: item.card.rarity,
        set: { external_id: item.card.set.externalId, name: item.card.set.name },
        ...display,
      },
    };
  });
}
