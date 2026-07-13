import type { PrismaClient } from '@prisma/client';
import type { ObjectStore } from '../integrations/storage/r2.js';
import { imageKey, warmImage, type ImageSize } from '../modules/catalog/images.js';

/**
 * Job `image-backfill` (T018): popula o cache R2 em ordem de prioridade —
 *   1) edições recentes (thumbnails da grade são o caso mais sensível de volume),
 *   2) cartas presentes em coleções/wishlists,
 *   3) restante do catálogo.
 * Dentro de cada tradução, thumbnail (small) antes da imagem grande (large).
 * Idempotente: pula o que já está cacheado (head). No-op sem R2 configurado.
 */

export interface ImageBackfillLogger {
  info: (msg: string) => void;
  warn: (msg: string) => void;
}

export interface ImageBackfillDeps {
  prisma: PrismaClient;
  store: ObjectStore;
  logger?: ImageBackfillLogger;
}

export interface ImageBackfillOptions {
  /** Máximo de traduções a processar (validação/dev). */
  limit?: number;
  /** Nº de edições recentes na prioridade 1. */
  recentSets?: number;
}

export interface ImageBackfillResult {
  warmed: number;
  failed: number;
  translations: number;
}

interface TranslationRow {
  id: string;
  imageSmallUrl: string;
  imageLargeUrl: string;
}

const SELECT = { id: true, imageSmallUrl: true, imageLargeUrl: true } as const;

export async function runImageBackfill(
  deps: ImageBackfillDeps,
  options: ImageBackfillOptions = {},
): Promise<ImageBackfillResult> {
  const { prisma, store } = deps;
  const log = deps.logger ?? { info: () => {}, warn: () => {} };
  const result: ImageBackfillResult = { warmed: 0, failed: 0, translations: 0 };

  if (!store.enabled) {
    log.warn('image-backfill: R2 não configurado — nada a fazer');
    return result;
  }

  const recentSets = options.recentSets ?? 20;
  const seen = new Set<string>();

  const warmRow = async (row: TranslationRow): Promise<void> => {
    if (seen.has(row.id)) return;
    seen.add(row.id);
    result.translations++;
    const sizes: { size: ImageSize; url: string }[] = [
      { size: 'small', url: row.imageSmallUrl },
      { size: 'large', url: row.imageLargeUrl },
    ];
    for (const { size, url } of sizes) {
      const obj = await warmImage(store, imageKey(row.id, size), url);
      if (obj) result.warmed++;
      else result.failed++;
    }
  };

  const reachedLimit = (): boolean => options.limit != null && seen.size >= options.limit;

  // Prioridade 1: edições recentes.
  const sets = await prisma.cardSet.findMany({
    orderBy: { releaseDate: 'desc' },
    take: recentSets,
    select: { id: true },
  });
  const tier1 = await prisma.cardTranslation.findMany({
    where: { card: { setId: { in: sets.map((s) => s.id) } } },
    select: SELECT,
  });
  for (const row of tier1) {
    if (reachedLimit()) break;
    await warmRow(row);
  }

  // Prioridade 2: cartas em coleções/wishlists.
  if (!reachedLimit()) {
    const tier2 = await prisma.cardTranslation.findMany({
      where: {
        card: { OR: [{ collectionItems: { some: {} } }, { wishlistItems: { some: {} } }] },
      },
      select: SELECT,
    });
    for (const row of tier2) {
      if (reachedLimit()) break;
      await warmRow(row);
    }
  }

  // Prioridade 3: restante (paginado por cursor).
  let cursor: string | undefined;
  while (!reachedLimit()) {
    const batch: TranslationRow[] = await prisma.cardTranslation.findMany({
      take: 500,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: 'asc' },
      select: SELECT,
    });
    if (batch.length === 0) break;
    cursor = batch[batch.length - 1]?.id;
    for (const row of batch) {
      if (reachedLimit()) break;
      await warmRow(row);
    }
  }

  log.info(
    `image-backfill concluído: ${result.translations} traduções, ${result.warmed} imagens cacheadas, ${result.failed} falhas`,
  );
  return result;
}
