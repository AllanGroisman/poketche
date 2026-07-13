import type { FastifyInstance } from 'fastify';
import { Prisma, type PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { conflict, notFound } from '../../lib/errors.js';
import { ensureProfile } from '../account/service.js';
import { localize } from '../catalog/localize.js';

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

type ItemWithCard = Prisma.CollectionItemGetPayload<{
  include: {
    card: {
      include: {
        set: { select: { externalId: true; name: true } };
        translations: { select: { id: true; language: true; name: true } };
      };
    };
  };
}>;

function serialize(item: ItemWithCard) {
  const display = localize(item.card.translations, item.language);
  return {
    id: item.id,
    condition: item.condition,
    language: item.language,
    variant: item.variant,
    quantity: item.quantity,
    acquisition_price_cents: item.acquisitionPriceCents,
    added_at: item.addedAt,
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

const includeCard = {
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
    return { items: items.map(serialize) };
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
