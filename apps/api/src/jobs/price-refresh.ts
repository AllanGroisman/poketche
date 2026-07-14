import { Prisma, type PrismaClient } from '@prisma/client';
import { checkPriceSanity } from '../integrations/pricing/sanity.js';
import type { PriceCardRef, PriceQuote } from '../integrations/pricing/types.js';
import type { PriceResolver } from '../integrations/pricing/resolver.js';

/**
 * Job `price-refresh` (T038) — cotações em **dois níveis** (research §2):
 *   - `hot`: cartas em coleções, wishlists e edições recentes (mesma priorização do backfill
 *     de imagens) — ciclo diário;
 *   - `tail`: o restante do catálogo, fatiado ao longo da semana (`skip`/`take`) para que toda
 *     carta tenha cotação com no máximo 7 dias;
 *   - `all`: catálogo inteiro (validação/dev).
 *
 * Para cada carta o `PriceResolver` resolve a cotação com fallback por carta. Cada cotação
 * passa por **sanidade** contra a última publicada (constituição I/IV): variação suspeita não
 * é publicada, preservando a última cotação. Publicação = upsert idempotente em `card_price`.
 */

export interface PriceRefreshLogger {
  info: (msg: string) => void;
  warn: (msg: string) => void;
}

export interface PriceRefreshDeps {
  prisma: PrismaClient;
  resolver: PriceResolver;
  /** Fator máximo de variação tolerado na sanidade (config PRICING_SANITY_MAX_FACTOR). */
  sanityMaxFactor: number;
  logger?: PriceRefreshLogger;
}

export type PriceTier = 'hot' | 'tail' | 'all';

export interface PriceRefreshOptions {
  tier?: PriceTier;
  /** Restringe a cartas específicas (ids internos) — validação/dev. */
  cardIds?: string[];
  /** Janela do fatiamento (rotação semanal da cauda). */
  skip?: number;
  take?: number;
  /** Dias para considerar uma edição "recente" no conjunto quente. */
  recentDays?: number;
}

export interface PriceRefreshResult {
  cardsProcessed: number;
  quotesPublished: number;
  suspicious: number;
  cardsWithoutPrice: number;
}

/** Chave da cotação vigente (mesma granularidade do UNIQUE de card_price). */
export function priceKey(
  cardId: string,
  condition: string | null,
  variant: string,
  source: string,
): string {
  return `${cardId}|${condition ?? '∅'}|${variant}|${source}`;
}

function recentCutoff(days: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d;
}

/** Monta o `where` do Prisma para o nível pedido (hot = quente; tail = complemento). */
export function tierWhere(tier: PriceTier, recentDays: number): Prisma.CardWhereInput {
  if (tier === 'all') return {};
  const cutoff = recentCutoff(recentDays);
  const hotOr: Prisma.CardWhereInput[] = [
    { collectionItems: { some: {} } },
    { wishlistItems: { some: {} } },
    { set: { releaseDate: { gte: cutoff } } },
  ];
  if (tier === 'hot') return { OR: hotOr };
  // tail = NOT hot: sem coleção, sem wishlist e edição não-recente (ou sem data).
  return {
    collectionItems: { none: {} },
    wishlistItems: { none: {} },
    OR: [{ set: { releaseDate: null } }, { set: { releaseDate: { lt: cutoff } } }],
  };
}

/** Upsert idempotente da cotação vigente (raw p/ usar o índice NULLS NOT DISTINCT). */
export async function upsertCardPrice(
  prisma: Pick<PrismaClient, '$executeRaw'>,
  cardId: string,
  quote: PriceQuote,
): Promise<void> {
  const fx = quote.fxRate == null ? null : new Prisma.Decimal(quote.fxRate);
  await prisma.$executeRaw`
    INSERT INTO card_price (id, card_id, condition, variant, price_cents, source, fx_rate, fetched_at)
    VALUES (
      gen_random_uuid(), ${cardId}::uuid, ${quote.condition}::"Condition",
      ${quote.variant}::"Variant", ${quote.priceCents}, ${quote.source}::"PriceSource",
      ${fx}, ${quote.fetchedAt}
    )
    ON CONFLICT (card_id, condition, variant, source) DO UPDATE
      SET price_cents = EXCLUDED.price_cents,
          fx_rate = EXCLUDED.fx_rate,
          fetched_at = EXCLUDED.fetched_at
  `;
}

export async function runPriceRefresh(
  deps: PriceRefreshDeps,
  options: PriceRefreshOptions = {},
): Promise<PriceRefreshResult> {
  const { prisma, resolver, sanityMaxFactor } = deps;
  const log = deps.logger ?? { info: () => {}, warn: () => {} };
  const tier = options.tier ?? 'hot';
  const recentDays = options.recentDays ?? 180;

  const where: Prisma.CardWhereInput = options.cardIds?.length
    ? { id: { in: options.cardIds } }
    : tierWhere(tier, recentDays);

  const cards = await prisma.card.findMany({
    where,
    select: { id: true, externalId: true },
    orderBy: { id: 'asc' },
    skip: options.skip,
    take: options.take,
  });

  log.info(`price-refresh (${tier}): ${cards.length} cartas a cotar (fontes: ${resolver.sources})`);

  const result: PriceRefreshResult = {
    cardsProcessed: 0,
    quotesPublished: 0,
    suspicious: 0,
    cardsWithoutPrice: 0,
  };

  for (const card of cards) {
    result.cardsProcessed++;
    const ref: PriceCardRef = { cardId: card.id, externalId: card.externalId };
    const quotes = await resolver.resolve(ref);
    if (quotes.length === 0) {
      result.cardsWithoutPrice++;
      continue;
    }

    // Cotações vigentes atuais da carta, para a checagem de sanidade.
    const current = await prisma.cardPrice.findMany({ where: { cardId: card.id } });
    const currentByKey = new Map(
      current.map((p) => [priceKey(p.cardId, p.condition, p.variant, p.source), p.priceCents]),
    );

    for (const quote of quotes) {
      const key = priceKey(card.id, quote.condition, quote.variant, quote.source);
      const prev = currentByKey.get(key) ?? null;
      const sanity = checkPriceSanity(prev, quote.priceCents, sanityMaxFactor);
      if (!sanity.ok) {
        result.suspicious++;
        log.warn(`  ⚠ ${card.externalId} ${quote.variant}/${quote.source}: ${sanity.reason}`);
        continue; // preserva a última cotação
      }
      await upsertCardPrice(prisma, card.id, quote);
      result.quotesPublished++;
    }
  }

  log.info(
    `price-refresh concluído: ${result.cardsProcessed} cartas, ${result.quotesPublished} cotações, ` +
      `${result.suspicious} suspeitas, ${result.cardsWithoutPrice} sem preço`,
  );
  return result;
}
