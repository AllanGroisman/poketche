import type { FastifyInstance } from 'fastify';
import { Prisma, type Language, type PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { conflict, notFound } from '../../lib/errors.js';
import { ensureProfile } from '../account/service.js';
import { localize } from '../catalog/localize.js';
import { selectWishlistPrice, serializePrice, type PriceLike } from '../pricing/current.js';

/**
 * Wishlists com preço-alvo (US9 — T061, FR-044/045/048/049/050/051).
 *
 * A wishlist é no nível da **carta canônica** (data-model §Wishlists): o usuário deseja "a
 * carta", não uma condição/variante específica. Por isso o alvo enfrenta a menor cotação entre
 * as variantes (`selectWishlistPrice`), e o payload sempre diz **qual** variante é aquele preço
 * — o número sozinho seria ambíguo.
 *
 * Nada aqui depende de `alert_state`: os indicadores de tela são calculados ao vivo a partir de
 * preço vs. alvo, então desligar notificações não muda o visual (FR-048).
 */

const langSchema = z.enum(['pt', 'en']).default('pt');

const createListSchema = z.object({
  name: z.string().min(1).max(60),
  notifications_enabled: z.boolean().default(true),
});

const patchListSchema = z
  .object({
    name: z.string().min(1).max(60),
    notifications_enabled: z.boolean(),
  })
  .partial();

// Preço-alvo é opcional, mas quando informado é > 0 (FR-045).
const targetSchema = z.number().int().positive().nullish();

const addItemSchema = z.union([
  z.object({ card_id: z.string().uuid(), target_price_cents: targetSchema }),
  // Atalho em lote a partir da completude da edição (FR-072): as faltantes de uma vez.
  z.object({ card_ids: z.array(z.string().uuid()).min(1).max(500) }),
]);

const patchItemSchema = z.object({ target_price_cents: targetSchema });

/** Confirma a posse da wishlist antes de qualquer operação — 404 opaco para lista de outro. */
async function ownedWishlist(
  prisma: PrismaClient,
  id: string,
  userId: string,
): Promise<{ id: string }> {
  const list = await prisma.wishlist.findFirst({ where: { id, userId }, select: { id: true } });
  if (!list) throw notFound('wishlist não encontrada');
  return list;
}

export function registerWishlists(app: FastifyInstance, prisma: PrismaClient): void {
  // ---------------------------------------------------------------- wishlists (FR-044)

  app.get('/wishlists', { preHandler: app.requireAuth }, async (req) => {
    const lists = await prisma.wishlist.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: 'asc' },
      include: { _count: { select: { items: true } } },
    });
    return {
      wishlists: lists.map((l) => ({
        id: l.id,
        name: l.name,
        notifications_enabled: l.notificationsEnabled,
        item_count: l._count.items,
        created_at: l.createdAt,
      })),
    };
  });

  app.post('/wishlists', { preHandler: app.requireAuth }, async (req, reply) => {
    const body = createListSchema.parse(req.body);
    await ensureProfile(prisma, req.user!);
    const list = await prisma.wishlist.create({
      data: {
        userId: req.user!.id,
        name: body.name,
        notificationsEnabled: body.notifications_enabled,
      },
    });
    reply.status(201);
    return {
      id: list.id,
      name: list.name,
      notifications_enabled: list.notificationsEnabled,
      item_count: 0,
      created_at: list.createdAt,
    };
  });

  app.patch('/wishlists/:id', { preHandler: app.requireAuth }, async (req) => {
    const { id } = req.params as { id: string };
    await ownedWishlist(prisma, id, req.user!.id);
    const body = patchListSchema.parse(req.body);
    const list = await prisma.wishlist.update({
      where: { id },
      data: { name: body.name, notificationsEnabled: body.notifications_enabled },
      include: { _count: { select: { items: true } } },
    });
    return {
      id: list.id,
      name: list.name,
      notifications_enabled: list.notificationsEnabled,
      item_count: list._count.items,
      created_at: list.createdAt,
    };
  });

  app.delete('/wishlists/:id', { preHandler: app.requireAuth }, async (req) => {
    const { id } = req.params as { id: string };
    const result = await prisma.wishlist.deleteMany({ where: { id, userId: req.user!.id } });
    if (result.count === 0) throw notFound('wishlist não encontrada');
    return { deleted: true };
  });

  // ---------------------------------------------------------------- itens (FR-045/049/050/051)

  app.get('/wishlists/:id', { preHandler: app.requireAuth }, async (req) => {
    const { id } = req.params as { id: string };
    const lang = langSchema.parse((req.query as { lang?: string }).lang);
    const userId = req.user!.id;

    const list = await prisma.wishlist.findFirst({
      where: { id, userId },
      include: {
        items: {
          orderBy: { createdAt: 'asc' },
          include: {
            card: {
              include: {
                set: { select: { externalId: true, name: true } },
                translations: { select: { id: true, language: true, name: true } },
              },
            },
          },
        },
      },
    });
    if (!list) throw notFound('wishlist não encontrada');

    const cardIds = [...new Set(list.items.map((i) => i.cardId))];
    const [prices, owned, listings] = await Promise.all([
      cardIds.length
        ? prisma.cardPrice.findMany({ where: { cardId: { in: cardIds } } })
        : Promise.resolve([]),
      // "Já na coleção" (FR-051): qualquer condição/idioma/variante conta como posse da carta.
      cardIds.length
        ? prisma.collectionItem.findMany({
            where: { userId, cardId: { in: cardIds } },
            select: { cardId: true, quantity: true },
          })
        : Promise.resolve([]),
      // Anúncios ativos da carta (FR-050). Até a US6 existir isto vem vazio — a UI já lida.
      cardIds.length
        ? prisma.listing.findMany({
            where: { status: 'active', collectionItem: { cardId: { in: cardIds } } },
            orderBy: { priceCents: 'asc' },
            select: {
              id: true,
              priceCents: true,
              shippingPriceCents: true,
              collectionItem: { select: { cardId: true } },
            },
          })
        : Promise.resolve([]),
    ]);

    const pricesByCard = new Map<string, PriceLike[]>();
    for (const p of prices) {
      const acc = pricesByCard.get(p.cardId) ?? [];
      acc.push(p);
      pricesByCard.set(p.cardId, acc);
    }
    const ownedByCard = new Map<string, number>();
    for (const item of owned) {
      ownedByCard.set(item.cardId, (ownedByCard.get(item.cardId) ?? 0) + item.quantity);
    }
    const listingsByCard = new Map<string, typeof listings>();
    for (const l of listings) {
      const acc = listingsByCard.get(l.collectionItem.cardId) ?? [];
      acc.push(l);
      listingsByCard.set(l.collectionItem.cardId, acc);
    }

    const items = list.items.map((item) => {
      const price = selectWishlistPrice(pricesByCard.get(item.cardId) ?? []);
      const target = item.targetPriceCents;
      // Diferença positiva = quanto o preço ainda está acima do alvo (FR-049).
      const differenceCents = price && target != null ? price.priceCents - target : null;
      const targetReached = price != null && target != null && price.priceCents <= target;

      // Anúncios no alvo ou abaixo (FR-050) — comparação pelo preço do item, sem frete: o alvo
      // é sobre a carta. `shipping_price_cents` vai junto para a tela não esconder o custo real.
      const cardListings = listingsByCard.get(item.cardId) ?? [];
      const atOrBelow = target == null ? [] : cardListings.filter((l) => l.priceCents <= target);

      return {
        id: item.id,
        card: {
          id: item.card.id,
          external_id: item.card.externalId,
          number: item.card.number,
          rarity: item.card.rarity,
          set: { external_id: item.card.set.externalId, name: item.card.set.name },
          ...localize(item.card.translations, lang as Language),
        },
        target_price_cents: target,
        // Sem cotação → "preço indisponível" e nenhum alerta (FR-049).
        price: serializePrice(price),
        price_variant: price?.variant ?? null,
        price_available: price != null,
        difference_cents: differenceCents,
        target_reached: targetReached,
        in_collection: {
          owned: ownedByCard.has(item.cardId),
          quantity: ownedByCard.get(item.cardId) ?? 0,
        },
        listings_at_or_below_target: {
          count: atOrBelow.length,
          cheapest: atOrBelow[0]
            ? {
                id: atOrBelow[0].id,
                price_cents: atOrBelow[0].priceCents,
                shipping_price_cents: atOrBelow[0].shippingPriceCents,
              }
            : null,
        },
        created_at: item.createdAt,
      };
    });

    return {
      id: list.id,
      name: list.name,
      notifications_enabled: list.notificationsEnabled,
      created_at: list.createdAt,
      items,
      summary: {
        item_count: items.length,
        targets_reached: items.filter((i) => i.target_reached).length,
        unpriced_items: items.filter((i) => !i.price_available).length,
      },
    };
  });

  app.post('/wishlists/:id/items', { preHandler: app.requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    await ownedWishlist(prisma, id, req.user!.id);
    const body = addItemSchema.parse(req.body);

    // Lote (FR-072): idempotente por desenho — cartas já na lista são ignoradas, não são erro.
    if ('card_ids' in body) {
      const found = await prisma.card.findMany({
        where: { id: { in: body.card_ids } },
        select: { id: true },
      });
      const result = await prisma.wishlistItem.createMany({
        data: found.map((c) => ({ wishlistId: id, cardId: c.id })),
        skipDuplicates: true,
      });
      reply.status(201);
      return {
        added: result.count,
        // O lote vem de `missing_card_ids` da completude; ids fantasmas são ruído, não falha.
        ignored: body.card_ids.length - result.count,
      };
    }

    const card = await prisma.card.findUnique({
      where: { id: body.card_id },
      select: { id: true },
    });
    if (!card) throw notFound('carta não encontrada');

    try {
      const item = await prisma.wishlistItem.create({
        data: {
          wishlistId: id,
          cardId: body.card_id,
          targetPriceCents: body.target_price_cents ?? null,
        },
      });
      reply.status(201);
      return {
        id: item.id,
        card_id: item.cardId,
        target_price_cents: item.targetPriceCents,
        created_at: item.createdAt,
      };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw conflict('carta já está nesta wishlist');
      }
      throw err;
    }
  });

  // Editar o alvo a qualquer momento (FR-045). Desvio de contrato registrado: contracts/rest-api.md
  // lista só POST/DELETE de itens, mas o alvo é editável — sem PATCH, mudar exigiria remover e
  // re-adicionar, o que zeraria `alert_state`/`last_notified_at` e reabriria o spam do FR-047.
  app.patch('/wishlists/:id/items/:itemId', { preHandler: app.requireAuth }, async (req) => {
    const { id, itemId } = req.params as { id: string; itemId: string };
    await ownedWishlist(prisma, id, req.user!.id);
    const body = patchItemSchema.parse(req.body);

    const existing = await prisma.wishlistItem.findFirst({
      where: { id: itemId, wishlistId: id },
      select: { id: true, targetPriceCents: true },
    });
    if (!existing) throw notFound('item não encontrado');

    const target = body.target_price_cents ?? null;
    // Alvo novo rearma: um alvo mais alto pode já estar satisfeito pelo preço atual, e o usuário
    // espera ser avisado — sem isto, um item `notified` ficaria mudo até o preço subir e cair.
    const rearm = target !== existing.targetPriceCents;

    const item = await prisma.wishlistItem.update({
      where: { id: itemId },
      data: {
        targetPriceCents: target,
        ...(rearm ? { alertState: 'armed' as const, lastNotifiedAt: null } : {}),
      },
    });
    return {
      id: item.id,
      card_id: item.cardId,
      target_price_cents: item.targetPriceCents,
      created_at: item.createdAt,
    };
  });

  app.delete('/wishlists/:id/items/:itemId', { preHandler: app.requireAuth }, async (req) => {
    const { id, itemId } = req.params as { id: string; itemId: string };
    await ownedWishlist(prisma, id, req.user!.id);
    const result = await prisma.wishlistItem.deleteMany({ where: { id: itemId, wishlistId: id } });
    if (result.count === 0) throw notFound('item não encontrado');
    return { deleted: true };
  });
}
