import type { FastifyInstance } from 'fastify';
import type { CardPrice, PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { notFound } from '../../lib/errors.js';
import { ensureProfile } from '../account/service.js';
import { includeCard, serialize } from '../collection/routes.js';
import type { PriceLike } from '../pricing/current.js';
import type { SnapshotLike } from '../pricing/history.js';
import { valueSnapshot, type ValuableItem } from '../stats/valuation.js';

/**
 * Coleções personalizadas (feature 002 — US1/US2/US3/US4): pastas que recortam o inventário.
 * O vínculo aponta para o `collection_item` (posição do inventário), então contagem e valor do
 * recorte **reusam** a valoração da US4 (`valueSnapshot`) sobre o subconjunto vinculado — sem
 * reimplementar cálculo — e a listagem reusa o `serialize`/`includeCard` do inventário (US2).
 * Nada aqui escreve em `collection_item` nem alimenta as estatísticas gerais do dashboard.
 *
 * O compartilhamento público por pasta (US5) vive em `share.ts` (dono) e `public.ts` (visitante).
 */

const createSchema = z.object({ name: z.string().trim().min(1).max(60) });
const renameSchema = z.object({ name: z.string().trim().min(1).max(60) });
const linkSchema = z.object({ collection_item_id: z.string().uuid() });
const listSliceSchema = z.object({ sort: z.enum(['recent', 'oldest']).default('recent') });

interface SliceSummary {
  total_cents: number;
  priced_items: number;
  unpriced_items: number;
  distinct_cards: number;
  total_quantity: number;
}

/** Resumo do recorte no mesmo formato do dashboard (US4): valoração reusada + contagens. */
export function sliceSummary(
  items: ValuableItem[],
  pricesByCard: Map<string, PriceLike[]>,
): SliceSummary {
  const snapshot = valueSnapshot(items, pricesByCard);
  const cards = new Set<string>();
  let quantity = 0;
  for (const item of items) {
    cards.add(item.cardId);
    quantity += item.quantity;
  }
  return { ...snapshot, distinct_cards: cards.size, total_quantity: quantity };
}

const EMPTY_SUMMARY: SliceSummary = {
  total_cents: 0,
  priced_items: 0,
  unpriced_items: 0,
  distinct_cards: 0,
  total_quantity: 0,
};

/** Agrupa cotações por carta (mesmo padrão da listagem/stats). */
function groupPrices(prices: CardPrice[]): Map<string, PriceLike[]> {
  const byCard = new Map<string, PriceLike[]>();
  for (const p of prices) {
    const list = byCard.get(p.cardId) ?? [];
    list.push(p);
    byCard.set(p.cardId, list);
  }
  return byCard;
}

/** Confirma a posse da pasta antes de qualquer operação — 404 opaco para pasta de outro (FR-010). */
export async function ownedCollection(
  prisma: PrismaClient,
  id: string,
  userId: string,
): Promise<{ id: string }> {
  const collection = await prisma.collection.findFirst({
    where: { id, userId },
    select: { id: true },
  });
  if (!collection) throw notFound('coleção não encontrada');
  return collection;
}

export function registerCustomCollections(app: FastifyInstance, prisma: PrismaClient): void {
  // ---------------------------------------------------------------- pastas (US1/US4)

  // Hub (US4/FR-015): pastas do usuário com resumo de recorte (cartas distintas · unidades · valor).
  app.get('/collections', { preHandler: app.requireAuth }, async (req) => {
    const userId = req.user!.id;
    const collections = await prisma.collection.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      include: {
        memberships: {
          select: {
            collectionItem: {
              select: { cardId: true, condition: true, variant: true, quantity: true },
            },
          },
        },
      },
    });

    // Uma única leitura de cotações para todas as pastas (sem N+1).
    const cardIds = [
      ...new Set(collections.flatMap((c) => c.memberships.map((m) => m.collectionItem.cardId))),
    ];
    const prices = cardIds.length
      ? await prisma.cardPrice.findMany({ where: { cardId: { in: cardIds } } })
      : [];
    const pricesByCard = groupPrices(prices);

    return {
      collections: collections.map((c) => ({
        id: c.id,
        name: c.name,
        summary: sliceSummary(
          c.memberships.map((m) => m.collectionItem),
          pricesByCard,
        ),
        shared: c.status === 'public_link',
        created_at: c.createdAt,
      })),
    };
  });

  app.post('/collections', { preHandler: app.requireAuth }, async (req, reply) => {
    const body = createSchema.parse(req.body);
    await ensureProfile(prisma, req.user!);
    const collection = await prisma.collection.create({
      data: { userId: req.user!.id, name: body.name },
    });
    reply.status(201);
    return {
      id: collection.id,
      name: collection.name,
      summary: EMPTY_SUMMARY,
      shared: false,
      created_at: collection.createdAt,
    };
  });

  app.patch('/collections/:id', { preHandler: app.requireAuth }, async (req) => {
    const { id } = req.params as { id: string };
    await ownedCollection(prisma, id, req.user!.id);
    const body = renameSchema.parse(req.body);
    const collection = await prisma.collection.update({ where: { id }, data: { name: body.name } });
    return {
      id: collection.id,
      name: collection.name,
      shared: collection.status === 'public_link',
      created_at: collection.createdAt,
    };
  });

  // Excluir apaga só a pasta + seus vínculos (cascata); nunca os itens do inventário (FR-004).
  app.delete('/collections/:id', { preHandler: app.requireAuth }, async (req) => {
    const { id } = req.params as { id: string };
    const result = await prisma.collection.deleteMany({ where: { id, userId: req.user!.id } });
    if (result.count === 0) throw notFound('coleção não encontrada');
    return { deleted: true };
  });

  // ---------------------------------------------------------------- vínculos (US2)

  // Vincular um item do próprio inventário à pasta. Idempotente (revincular não duplica — FR-009).
  app.post('/collections/:id/items', { preHandler: app.requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    await ownedCollection(prisma, id, req.user!.id);
    const body = linkSchema.parse(req.body);

    // Só itens que o usuário possui (FR-010): 404 opaco para item de outro/inexistente.
    const item = await prisma.collectionItem.findFirst({
      where: { id: body.collection_item_id, userId: req.user!.id },
      select: { id: true },
    });
    if (!item) throw notFound('item não encontrado');

    await prisma.collectionMembership.createMany({
      data: [{ collectionId: id, collectionItemId: body.collection_item_id }],
      skipDuplicates: true,
    });
    reply.status(201);
    return { linked: true, collection_item_id: body.collection_item_id };
  });

  // Desvincular. Idempotente e não afeta o inventário nem outras pastas (FR-008).
  app.delete(
    '/collections/:id/items/:collectionItemId',
    { preHandler: app.requireAuth },
    async (req) => {
      const { id, collectionItemId } = req.params as { id: string; collectionItemId: string };
      await ownedCollection(prisma, id, req.user!.id);
      await prisma.collectionMembership.deleteMany({
        where: { collectionId: id, collectionItemId },
      });
      return { unlinked: true };
    },
  );

  // ---------------------------------------------------------------- recorte (US3)

  // Abrir a pasta: itens no MESMO shape da listagem do inventário + resumo do recorte.
  app.get('/collections/:id', { preHandler: app.requireAuth }, async (req) => {
    const { id } = req.params as { id: string };
    const { sort } = listSliceSchema.parse(req.query);
    const collection = await prisma.collection.findFirst({
      where: { id, userId: req.user!.id },
      select: { id: true, name: true, status: true },
    });
    if (!collection) throw notFound('coleção não encontrada');

    const memberships = await prisma.collectionMembership.findMany({
      where: { collectionId: id },
      orderBy: { collectionItem: { addedAt: sort === 'recent' ? 'desc' : 'asc' } },
      include: { collectionItem: { include: includeCard } },
    });
    const items = memberships.map((m) => m.collectionItem);

    // Cotações + snapshots recentes (tendência) das cartas do recorte — mesmo padrão do inventário.
    const cardIds = [...new Set(items.map((i) => i.cardId))];
    const prices = cardIds.length
      ? await prisma.cardPrice.findMany({ where: { cardId: { in: cardIds } } })
      : [];
    const pricesByCard = groupPrices(prices);

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

    return {
      id: collection.id,
      name: collection.name,
      shared: collection.status === 'public_link',
      items: items.map((item) =>
        serialize(item, pricesByCard.get(item.cardId) ?? [], snapsByCard.get(item.cardId) ?? []),
      ),
      summary: sliceSummary(items, pricesByCard),
    };
  });
}
