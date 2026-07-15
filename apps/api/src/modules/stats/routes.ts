import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { localize } from '../catalog/localize.js';
import type { PriceLike } from '../pricing/current.js';
import type { GainLoss, PeriodVariation, SnapshotLike } from '../pricing/history.js';
import {
  acquisitionPnl,
  completion,
  distribution,
  movers,
  overview,
  topValue,
  type DistributionAxis,
  type RankEntry,
  type RankingType,
  type StatItem,
} from './valuation.js';

/**
 * Dashboard de estatísticas da coleção (T047, US4/FR-016–FR-020a). Todos os endpoints
 * autenticados operam sobre a coleção do usuário. A lógica é pura (`valuation.ts`); aqui só
 * carregamos os dados e serializamos. Movers e P&L reusam a variação/ganho honestos da US8.
 */

// Janela de snapshots p/ rankings de variação: cobre 90d + folga p/ a referência anterior.
const MOVERS_WINDOW_DAYS = 120;
const PERIOD_DAYS: Record<'7d' | '30d' | '90d', number> = { '7d': 7, '30d': 30, '90d': 90 };

type ItemRow = {
  id: string;
  cardId: string;
  condition: StatItem['condition'];
  language: StatItem['language'];
  variant: StatItem['variant'];
  quantity: number;
  acquisitionPriceCents: number | null;
  addedAt: Date;
  card: {
    id: string;
    number: string;
    rarity: string;
    types: string[];
    translations: { id: string; language: StatItem['language']; name: string }[];
    set: { externalId: string; name: string; totalCards: number };
  };
};

/** Normaliza o item do Prisma para o formato puro de estatística (nome já localizado). */
function toStatItem(row: ItemRow): StatItem {
  const display = localize(row.card.translations, row.language);
  return {
    id: row.id,
    cardId: row.cardId,
    condition: row.condition,
    language: row.language,
    variant: row.variant,
    quantity: row.quantity,
    acquisitionPriceCents: row.acquisitionPriceCents,
    addedAt: row.addedAt,
    card: {
      id: row.card.id,
      number: row.card.number,
      rarity: row.card.rarity,
      types: row.card.types,
      name: display?.name ?? row.card.translations[0]?.name ?? row.card.number,
      imageSmallUrl: display?.image_small_url ?? '',
      setExternalId: row.card.set.externalId,
      setName: row.card.set.name,
      setTotalCards: row.card.set.totalCards,
    },
  };
}

async function loadItems(prisma: PrismaClient, userId: string): Promise<StatItem[]> {
  const rows = await prisma.collectionItem.findMany({
    where: { userId },
    select: {
      id: true,
      cardId: true,
      condition: true,
      language: true,
      variant: true,
      quantity: true,
      acquisitionPriceCents: true,
      addedAt: true,
      card: {
        select: {
          id: true,
          number: true,
          rarity: true,
          types: true,
          translations: { select: { id: true, language: true, name: true } },
          set: { select: { externalId: true, name: true, totalCards: true } },
        },
      },
    },
  });
  return rows.map(toStatItem);
}

async function loadPricesByCard(
  prisma: PrismaClient,
  items: StatItem[],
): Promise<Map<string, PriceLike[]>> {
  const cardIds = [...new Set(items.map((i) => i.cardId))];
  const prices = cardIds.length
    ? await prisma.cardPrice.findMany({ where: { cardId: { in: cardIds } } })
    : [];
  const byCard = new Map<string, PriceLike[]>();
  for (const p of prices) {
    const list = byCard.get(p.cardId) ?? [];
    list.push(p);
    byCard.set(p.cardId, list);
  }
  return byCard;
}

async function loadSnapsByCard(
  prisma: PrismaClient,
  items: StatItem[],
): Promise<Map<string, SnapshotLike[]>> {
  const cardIds = [...new Set(items.map((i) => i.cardId))];
  const since = new Date(Date.now() - MOVERS_WINDOW_DAYS * 86_400_000);
  const snaps = cardIds.length
    ? await prisma.cardPriceSnapshot.findMany({
        where: { cardId: { in: cardIds }, fetchedAt: { gte: since } },
        select: {
          cardId: true,
          condition: true,
          variant: true,
          priceCents: true,
          source: true,
          fetchedAt: true,
        },
      })
    : [];
  const byCard = new Map<string, (SnapshotLike & { cardId: string })[]>();
  for (const s of snaps) {
    const list = byCard.get(s.cardId) ?? [];
    list.push(s);
    byCard.set(s.cardId, list);
  }
  return byCard as Map<string, SnapshotLike[]>;
}

function serializeRankEntry(entry: RankEntry): {
  item_id: string;
  condition: string;
  language: string;
  variant: string;
  quantity: number;
  value_cents: number | null;
  variation: PeriodVariation | null;
  gain_loss: GainLoss | null;
  card: {
    id: string;
    number: string;
    rarity: string;
    name: string;
    image_small_url: string;
    set: { external_id: string; name: string };
  };
} {
  const { item } = entry;
  return {
    item_id: item.id,
    condition: item.condition,
    language: item.language,
    variant: item.variant,
    quantity: item.quantity,
    value_cents: entry.valueCents,
    variation: entry.variation ?? null,
    gain_loss: entry.gainLoss ?? null,
    card: {
      id: item.card.id,
      number: item.card.number,
      rarity: item.card.rarity,
      name: item.card.name,
      image_small_url: item.card.imageSmallUrl,
      set: { external_id: item.card.setExternalId, name: item.card.setName },
    },
  };
}

const distributionQuery = z.object({ by: z.enum(['set', 'rarity', 'type']).default('set') });
const rankingsQuery = z.object({
  type: z.enum(['top_value', 'gainers', 'losers', 'acquisition_pnl']).default('top_value'),
  period: z.enum(['7d', '30d', '90d']).default('30d'),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});
const historyQuery = z.object({ period: z.enum(['30d', '90d', '180d', 'all']).default('90d') });

export function registerStats(app: FastifyInstance, prisma: PrismaClient): void {
  // Valor total estimado + contagens (FR-016) + comparação com o último snapshot registrado.
  app.get('/stats/overview', { preHandler: app.requireAuth }, async (req) => {
    const items = await loadItems(prisma, req.user!.id);
    const pricesByCard = await loadPricesByCard(prisma, items);
    const summary = overview(items, pricesByCard);

    const last = await prisma.collectionValueSnapshot.findFirst({
      where: { userId: req.user!.id },
      orderBy: { takenAt: 'desc' },
      select: { totalCents: true, takenAt: true },
    });

    return {
      ...summary,
      last_snapshot: last ? { total_cents: last.totalCents, taken_at: last.takenAt } : null,
      change_since_last_cents: last ? summary.total_cents - last.totalCents : null,
    };
  });

  // Evolução do valor total ao longo do tempo (FR-017), a partir do histórico registrado.
  app.get('/stats/history', { preHandler: app.requireAuth }, async (req) => {
    const { period } = historyQuery.parse(req.query);
    const days = period === 'all' ? null : Number(period.replace('d', ''));
    const since = days == null ? undefined : new Date(Date.now() - days * 86_400_000);

    const snapshots = await prisma.collectionValueSnapshot.findMany({
      where: { userId: req.user!.id, ...(since ? { takenAt: { gte: since } } : {}) },
      orderBy: { takenAt: 'asc' },
      select: { totalCents: true, pricedItems: true, unpricedItems: true, takenAt: true },
    });

    // Ponto ao vivo de hoje, para o gráfico refletir o valor atual antes do próximo snapshot.
    const items = await loadItems(prisma, req.user!.id);
    const pricesByCard = await loadPricesByCard(prisma, items);
    const current = overview(items, pricesByCard);

    return {
      period,
      history_available: snapshots.length >= 2,
      points: snapshots.map((s) => ({
        taken_at: s.takenAt,
        total_cents: s.totalCents,
        priced_items: s.pricedItems,
        unpriced_items: s.unpricedItems,
      })),
      current: { total_cents: current.total_cents, priced_items: current.priced_items },
    };
  });

  // Distribuição por edição/raridade/tipo (FR-018).
  app.get('/stats/distribution', { preHandler: app.requireAuth }, async (req) => {
    const { by } = distributionQuery.parse(req.query);
    const items = await loadItems(prisma, req.user!.id);
    const pricesByCard = await loadPricesByCard(prisma, items);
    return { by: by as DistributionAxis, buckets: distribution(items, pricesByCard, by) };
  });

  // Rankings: mais valiosas (FR-019), valorização/desvalorização e P&L vs. aquisição (FR-020a).
  app.get('/stats/rankings', { preHandler: app.requireAuth }, async (req) => {
    const { type, period, limit } = rankingsQuery.parse(req.query);
    const items = await loadItems(prisma, req.user!.id);
    const pricesByCard = await loadPricesByCard(prisma, items);

    let entries: RankEntry[];
    if (type === 'top_value') entries = topValue(items, pricesByCard, limit);
    else if (type === 'acquisition_pnl') entries = acquisitionPnl(items, pricesByCard, limit);
    else {
      const snapsByCard = await loadSnapsByCard(prisma, items);
      entries = movers(items, pricesByCard, snapsByCard, PERIOD_DAYS[period], type, limit);
    }

    return {
      type: type as RankingType,
      period,
      entries: entries.map(serializeRankEntry),
    };
  });

  // Completude por edição (FR-020).
  app.get('/stats/completion', { preHandler: app.requireAuth }, async (req) => {
    const items = await loadItems(prisma, req.user!.id);
    return { sets: completion(items) };
  });
}
