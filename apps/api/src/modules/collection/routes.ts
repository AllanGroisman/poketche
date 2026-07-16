import type { FastifyInstance } from 'fastify';
import { Prisma, type PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { conflict, notFound } from '../../lib/errors.js';
import { ensureProfile } from '../account/service.js';
import { localize } from '../catalog/localize.js';
import {
  selectCurrentPrice,
  serializePrice,
  type PriceLike,
  type SerializedPrice,
} from '../pricing/current.js';
import {
  buildItemSeries,
  computeTrend,
  type SnapshotLike,
  type Trend,
} from '../pricing/history.js';

/**
 * Coleção do usuário (T030, FR-008/009/010). Cada combinação carta+condição+idioma+
 * variante é um item distinto (unique); adicionar a mesma combinação faz merge (soma a
 * quantidade). Regras de anúncio/estoque (422 abaixo do comprometido, desativação) entram
 * na US6. Preço vigente/valor/tendência no GET entram na US3.
 */

const conditionEnum = z.enum(['mint', 'near_mint', 'excellent', 'good', 'played', 'damaged']);
const languageEnum = z.enum(['en', 'pt']);
const variantEnum = z.enum(['normal', 'reverse_foil', 'holo']);

const createSchema = z.object({
  card_id: z.string().uuid(),
  condition: conditionEnum,
  language: languageEnum,
  variant: variantEnum.default('normal'),
  quantity: z.number().int().min(1),
  acquisition_price_cents: z.number().int().positive().nullish(),
});

const patchSchema = z
  .object({
    condition: conditionEnum,
    language: languageEnum,
    variant: variantEnum,
    quantity: z.number().int().min(1),
    acquisition_price_cents: z.number().int().positive().nullable(),
  })
  .partial();

const listSchema = z.object({
  sort: z.enum(['recent', 'oldest']).default('recent'),
});

export type ItemWithCard = Prisma.CollectionItemGetPayload<{
  include: {
    card: {
      include: {
        set: { select: { externalId: true; name: true } };
        translations: { select: { id: true; language: true; name: true } };
      };
    };
  };
}>;

function serialize(item: ItemWithCard, prices?: PriceLike[], snapshots?: SnapshotLike[]) {
  const display = localize(item.card.translations, item.language);
  // Preço vigente + valor da posição (FR-039); item sem cotação fica com price/valor nulos.
  const price = prices ? selectCurrentPrice(prices, item) : null;
  const serializedPrice: SerializedPrice | null = serializePrice(price);
  const positionValueCents = price ? price.priceCents * item.quantity : null;
  // Indicador de tendência recente para a listagem (FR-041): sinal da variação de 7d.
  const trend: Trend | null = snapshots
    ? computeTrend(buildItemSeries(snapshots, item), price?.priceCents ?? null, 7)
    : null;
  return {
    id: item.id,
    condition: item.condition,
    language: item.language,
    variant: item.variant,
    quantity: item.quantity,
    acquisition_price_cents: item.acquisitionPriceCents,
    added_at: item.addedAt,
    price: serializedPrice,
    position_value_cents: positionValueCents,
    trend,
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

/** Include compartilhado com a visão pública (US7) — mantém os dois payloads sem drift. */
export const includeCard = {
  card: {
    include: {
      set: { select: { externalId: true, name: true } },
      translations: { select: { id: true, language: true, name: true } },
    },
  },
} as const;

export function registerCollection(app: FastifyInstance, prisma: PrismaClient): void {
  app.get('/collection', { preHandler: app.requireAuth }, async (req) => {
    const { sort } = listSchema.parse(req.query);
    const items = await prisma.collectionItem.findMany({
      where: { userId: req.user!.id },
      include: includeCard,
      orderBy: { addedAt: sort === 'recent' ? 'desc' : 'asc' },
    });

    // Cotações vigentes das cartas da coleção, agrupadas por carta (FR-012/FR-013).
    const cardIds = [...new Set(items.map((i) => i.cardId))];
    const prices = cardIds.length
      ? await prisma.cardPrice.findMany({ where: { cardId: { in: cardIds } } })
      : [];
    const pricesByCard = new Map<string, PriceLike[]>();
    for (const p of prices) {
      const list = pricesByCard.get(p.cardId) ?? [];
      list.push(p);
      pricesByCard.set(p.cardId, list);
    }

    // Snapshots recentes (≈8d) só para o indicador de tendência da listagem (FR-041). A janela
    // cobre a referência em ou antes do corte de 7d sem carregar o histórico completo.
    const trendSince = new Date(Date.now() - 8 * 86_400_000);
    const snaps = cardIds.length
      ? await prisma.cardPriceSnapshot.findMany({
          where: { cardId: { in: cardIds }, fetchedAt: { gte: trendSince } },
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
    const snapsByCard = new Map<string, SnapshotLike[]>();
    for (const s of snaps) {
      const list = snapsByCard.get(s.cardId) ?? [];
      list.push(s);
      snapsByCard.set(s.cardId, list);
    }

    const serialized = items.map((item) =>
      serialize(item, pricesByCard.get(item.cardId) ?? [], snapsByCard.get(item.cardId) ?? []),
    );

    // Total = Σ valor das posições com preço; itens sem preço ficam fora, com indicação (FR-016).
    let totalCents = 0;
    let pricedItems = 0;
    let unpricedItems = 0;
    for (const s of serialized) {
      if (s.position_value_cents != null) {
        totalCents += s.position_value_cents;
        pricedItems++;
      } else {
        unpricedItems++;
      }
    }

    return {
      items: serialized,
      summary: {
        total_cents: totalCents,
        priced_items: pricedItems,
        unpriced_items: unpricedItems,
      },
    };
  });

  app.post('/collection/items', { preHandler: app.requireAuth }, async (req) => {
    const body = createSchema.parse(req.body);
    await ensureProfile(prisma, req.user!);

    const card = await prisma.card.findUnique({
      where: { id: body.card_id },
      select: { id: true },
    });
    if (!card) throw notFound('carta não encontrada');

    const item = await prisma.collectionItem.upsert({
      where: {
        userId_cardId_condition_language_variant: {
          userId: req.user!.id,
          cardId: body.card_id,
          condition: body.condition,
          language: body.language,
          variant: body.variant,
        },
      },
      // Merge (FR-009): soma a quantidade; preço de aquisição preserva o do primeiro registro.
      update: { quantity: { increment: body.quantity } },
      create: {
        userId: req.user!.id,
        cardId: body.card_id,
        condition: body.condition,
        language: body.language,
        variant: body.variant,
        quantity: body.quantity,
        acquisitionPriceCents: body.acquisition_price_cents ?? null,
      },
      include: includeCard,
    });

    // wishlist_matches entra na US9; stub por ora (FR-052).
    return { item: serialize(item), wishlist_matches: [] as unknown[] };
  });

  app.patch('/collection/items/:id', { preHandler: app.requireAuth }, async (req) => {
    const { id } = req.params as { id: string };
    const body = patchSchema.parse(req.body);
    const existing = await prisma.collectionItem.findFirst({
      where: { id, userId: req.user!.id },
      select: { id: true },
    });
    if (!existing) throw notFound('item não encontrado');

    try {
      const item = await prisma.collectionItem.update({
        where: { id },
        data: {
          condition: body.condition,
          language: body.language,
          variant: body.variant,
          quantity: body.quantity,
          acquisitionPriceCents: body.acquisition_price_cents,
        },
        include: includeCard,
      });
      return { item: serialize(item) };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw conflict('já existe um item com essa combinação de condição/idioma/variante');
      }
      throw err;
    }
  });

  app.delete('/collection/items/:id', { preHandler: app.requireAuth }, async (req) => {
    const { id } = req.params as { id: string };
    const result = await prisma.collectionItem.deleteMany({
      where: { id, userId: req.user!.id },
    });
    if (result.count === 0) throw notFound('item não encontrado');
    return { deleted: true };
  });
}
