import type { PrismaClient } from '@prisma/client';
import type { PriceLike } from '../modules/pricing/current.js';
import { valueSnapshot, type ValuableItem } from '../modules/stats/valuation.js';

/**
 * Job `collection-value-snapshot` (T046, FR-017) — fotografa diariamente o valor total da
 * coleção de cada usuário no histórico `collection_value_snapshot`, base da evolução do valor
 * no dashboard (US4). A valoração usa a MESMA regra da listagem/dashboard (`valueSnapshot` →
 * `selectCurrentPrice`), então o ponto do histórico bate com o total exibido ao vivo.
 *
 * Idempotente por dia: se já existe um snapshot do usuário no dia UTC corrente, não duplica.
 */

export interface CollectionValueSnapshotDeps {
  prisma: PrismaClient;
  logger?: { info: (msg: string) => void };
}

export interface CollectionValueSnapshotOptions {
  /** Restringe a um usuário (validação/dev); default: todos com itens. */
  onlyUserId?: string;
  /** Momento de referência do dia (default: agora). */
  now?: Date;
}

export interface CollectionValueSnapshotResult {
  usersProcessed: number;
  snapshotsWritten: number;
  skippedExisting: number;
}

function startOfUtcDay(now: Date): Date {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export async function runCollectionValueSnapshot(
  deps: CollectionValueSnapshotDeps,
  options: CollectionValueSnapshotOptions = {},
): Promise<CollectionValueSnapshotResult> {
  const { prisma } = deps;
  const now = options.now ?? new Date();
  const dayStart = startOfUtcDay(now);

  // Usuários com pelo menos um item na coleção (snapshot só faz sentido com posse).
  const userIds = (
    await prisma.collectionItem.findMany({
      where: options.onlyUserId ? { userId: options.onlyUserId } : {},
      distinct: ['userId'],
      select: { userId: true },
    })
  ).map((r) => r.userId);

  const result: CollectionValueSnapshotResult = {
    usersProcessed: 0,
    snapshotsWritten: 0,
    skippedExisting: 0,
  };

  for (const userId of userIds) {
    result.usersProcessed++;

    const existing = await prisma.collectionValueSnapshot.findFirst({
      where: { userId, takenAt: { gte: dayStart } },
      select: { id: true },
    });
    if (existing) {
      result.skippedExisting++;
      continue;
    }

    const items: ValuableItem[] = await prisma.collectionItem.findMany({
      where: { userId },
      select: { cardId: true, condition: true, variant: true, quantity: true },
    });

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

    const summary = valueSnapshot(items, pricesByCard);
    await prisma.collectionValueSnapshot.create({
      data: {
        userId,
        totalCents: summary.total_cents,
        pricedItems: summary.priced_items,
        unpricedItems: summary.unpriced_items,
        takenAt: now,
      },
    });
    result.snapshotsWritten++;
  }

  deps.logger?.info(
    `collection-value-snapshot: ${result.snapshotsWritten} snapshots (${result.usersProcessed} usuários, ` +
      `${result.skippedExisting} já feitos hoje)`,
  );
  return result;
}
