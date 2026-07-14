import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { notFound } from '../../lib/errors.js';
import {
  buildCardSeries,
  computeVariation,
  highLow,
  sliceByPeriod,
  type PeriodVariation,
  type PricePoint,
} from '../pricing/history.js';

/**
 * Histórico de preço público de uma carta (T043, FR-038/FR-043/FR-070): série de snapshots
 * para o gráfico, visível a visitantes (sem posse/conta). Escolhe a variante com mais dados
 * como referência de mercado. Sem interpolar: `change` fica `null` quando não há referência.
 */

const PERIOD_DAYS: Record<string, number | null> = { '7d': 7, '30d': 30, '90d': 90, all: null };

const querySchema = z.object({
  period: z.enum(['7d', '30d', '90d', 'all']).default('30d'),
});

// Teto de segurança da leitura (1 ponto/dia por carta): cobre 'all' sem varrer sem limite.
const MAX_WINDOW_DAYS = 400;

function serializeSeries(points: PricePoint[]): { t: string; price_cents: number }[] {
  return points.map((p) => ({ t: p.t.toISOString(), price_cents: p.priceCents }));
}

/** Variação do período: janelas fixas exigem referência ≤ início; `all` = primeiro→último. */
function periodChange(
  full: PricePoint[],
  currentCents: number | null,
  days: number | null,
  now: Date,
): PeriodVariation | null {
  if (days != null) return computeVariation(full, currentCents, days, now);
  if (full.length < 2 || currentCents == null) return null;
  const from = full[0]!.priceCents;
  return {
    from_cents: from,
    to_cents: currentCents,
    change_cents: currentCents - from,
    change_pct: from <= 0 ? 0 : Math.round(((currentCents - from) / from) * 1000) / 10,
  };
}

export function registerCatalogPriceHistory(app: FastifyInstance, prisma: PrismaClient): void {
  app.get('/catalog/cards/:id/price-history', async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = querySchema.safeParse(req.query);
    const period = parsed.success ? parsed.data.period : '30d';
    const days = PERIOD_DAYS[period]!;

    const card = await prisma.card.findUnique({ where: { id }, select: { id: true } });
    if (!card) throw notFound('carta não encontrada');

    const since = new Date(Date.now() - MAX_WINDOW_DAYS * 86_400_000);
    const snapshots = await prisma.cardPriceSnapshot.findMany({
      where: { cardId: id, fetchedAt: { gte: since } },
      select: { condition: true, variant: true, priceCents: true, source: true, fetchedAt: true },
    });

    const now = new Date();
    const { variant, points: full } = buildCardSeries(snapshots);
    const currentCents = full.at(-1)?.priceCents ?? null;
    const windowed = sliceByPeriod(full, days, now);

    // Público e cacheável; o sync/refresh diário invalida naturalmente (curto s-maxage).
    void reply.header('Cache-Control', 'public, max-age=300');

    return {
      card_id: id,
      variant,
      period,
      history_available: full.length >= 2,
      points: serializeSeries(windowed),
      high_low: highLow(windowed),
      change: periodChange(full, currentCents, days, now),
    };
  });
}
