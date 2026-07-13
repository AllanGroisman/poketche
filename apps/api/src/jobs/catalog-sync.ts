import type { PrismaClient } from '@prisma/client';
import type { CatalogCard, CatalogProvider, CatalogSet } from '../integrations/catalog/index.js';

/**
 * Job `catalog-sync` (T017): sincroniza o catálogo multilíngue (EN canônico + PT) para o
 * Postgres via upsert idempotente — seguro para rodar diariamente. Chaves de idempotência:
 *   card_set.external_id · card.external_id · (card_translation.card_id, language).
 */

export interface CatalogSyncLogger {
  info: (msg: string) => void;
  warn: (msg: string) => void;
}

export interface CatalogSyncDeps {
  provider: CatalogProvider;
  prisma: PrismaClient;
  logger?: CatalogSyncLogger;
}

export interface CatalogSyncOptions {
  /** Limita a edições específicas (externalId) — útil para validação/dev. */
  onlySets?: string[];
  /** Limita a quantidade de edições processadas (validação). */
  setLimit?: number;
}

export interface CatalogSyncResult {
  sets: number;
  cards: number;
  translations: number;
  skippedSets: number;
}

function releaseDateToDb(iso: string | null): Date | null {
  return iso ? new Date(`${iso}T00:00:00.000Z`) : null;
}

async function upsertSet(prisma: PrismaClient, set: CatalogSet): Promise<string> {
  const data = {
    name: set.name,
    series: set.series,
    totalCards: set.totalCards,
    releaseDate: releaseDateToDb(set.releaseDate),
    logoUrl: set.logoUrl,
    syncedAt: new Date(),
  };
  const row = await prisma.cardSet.upsert({
    where: { externalId: set.externalId },
    create: { externalId: set.externalId, ...data },
    update: data,
    select: { id: true },
  });
  return row.id;
}

async function upsertCard(
  prisma: PrismaClient,
  setId: string,
  card: CatalogCard,
): Promise<{ cards: number; translations: number }> {
  const data = {
    setId,
    number: card.number,
    rarity: card.rarity,
    supertype: card.supertype,
    subtypes: card.subtypes,
    types: card.types,
    syncedAt: new Date(),
  };
  const row = await prisma.card.upsert({
    where: { externalId: card.externalId },
    create: { externalId: card.externalId, ...data },
    update: data,
    select: { id: true },
  });

  let translations = 0;
  for (const t of card.translations) {
    await prisma.cardTranslation.upsert({
      where: { cardId_language: { cardId: row.id, language: t.language } },
      create: {
        cardId: row.id,
        language: t.language,
        name: t.name,
        imageSmallUrl: t.imageSmallUrl,
        imageLargeUrl: t.imageLargeUrl,
        source: t.source,
        syncedAt: new Date(),
      },
      update: {
        name: t.name,
        imageSmallUrl: t.imageSmallUrl,
        imageLargeUrl: t.imageLargeUrl,
        source: t.source,
        syncedAt: new Date(),
      },
    });
    translations++;
  }
  return { cards: 1, translations };
}

export async function runCatalogSync(
  deps: CatalogSyncDeps,
  options: CatalogSyncOptions = {},
): Promise<CatalogSyncResult> {
  const { provider, prisma } = deps;
  const log = deps.logger ?? { info: () => {}, warn: () => {} };
  const result: CatalogSyncResult = { sets: 0, cards: 0, translations: 0, skippedSets: 0 };

  let sets = await provider.listSets();
  if (options.onlySets?.length) {
    const wanted = new Set(options.onlySets);
    sets = sets.filter((s) => wanted.has(s.externalId));
  }
  if (options.setLimit != null) sets = sets.slice(0, options.setLimit);

  log.info(`catalog-sync: ${sets.length} edições a sincronizar`);

  for (const set of sets) {
    try {
      const setId = await upsertSet(prisma, set);
      const cards = await provider.listCards(set);
      for (const card of cards) {
        const { cards: c, translations: t } = await upsertCard(prisma, setId, card);
        result.cards += c;
        result.translations += t;
      }
      result.sets++;
      log.info(`  ✓ ${set.externalId} (${set.name}): ${cards.length} cartas`);
    } catch (err) {
      result.skippedSets++;
      log.warn(`  ✗ ${set.externalId}: ${(err as Error).message}`);
    }
  }

  log.info(
    `catalog-sync concluído: ${result.sets} edições, ${result.cards} cartas, ${result.translations} traduções (${result.skippedSets} edições com erro)`,
  );
  return result;
}
