import PgBoss from 'pg-boss';
import type { AppConfig } from '../lib/config.js';
import { prisma } from '../lib/prisma.js';
import { createCatalogProvider } from '../integrations/catalog/index.js';
import { createImageStore } from '../integrations/storage/r2.js';
import { createPriceResolver } from '../integrations/pricing/index.js';
import { runCatalogSync } from './catalog-sync.js';
import { runImageBackfill } from './image-backfill.js';
import { runPriceRefresh, tierWhere } from './price-refresh.js';
import { runPriceSnapshot } from './price-snapshot.js';

/**
 * Runner de jobs agendados (pg_boss sobre Postgres, no mesmo processo da API — sem
 * microserviços). Os handlers concretos são adicionados nas fases correspondentes:
 *   catalog-sync (T017), image-backfill (T018), price-refresh/price-snapshot (T038),
 *   collection-value-snapshot (T046), wishlist-alerts (T063),
 *   order-deadlines / payments-reconciliation (T086).
 */
export const JOB_NAMES = [
  'catalog-sync',
  'image-backfill',
  'price-refresh',
  'price-snapshot',
  'collection-value-snapshot',
  'wishlist-alerts',
  'order-deadlines',
  'payments-reconciliation',
] as const;

export type JobName = (typeof JOB_NAMES)[number];

export async function startJobs(config: AppConfig): Promise<PgBoss> {
  const boss = new PgBoss(config.DATABASE_URL);
  await boss.start();
  const logger = {
    info: (m: string) => console.log(`[jobs] ${m}`),
    warn: (m: string) => console.warn(`[jobs] ${m}`),
  };

  // catalog-sync (T017): sincroniza o catálogo multilíngue diariamente.
  await boss.work('catalog-sync', async () => {
    const provider = createCatalogProvider(config);
    await runCatalogSync({ provider, prisma, logger });
  });
  await boss.schedule('catalog-sync', '0 4 * * *'); // 04:00 diário

  // image-backfill (T018): popula o cache R2 após o sync.
  await boss.work('image-backfill', async () => {
    const store = createImageStore(config);
    await runImageBackfill({ prisma, store, logger });
  });
  await boss.schedule('image-backfill', '30 4 * * *'); // 04:30 diário, após o sync

  // price-refresh (T038): dois níveis. O conjunto quente é recotado diariamente; a cauda é
  // fatiada em 7 (uma fatia por dia da semana), garantindo cotação com no máximo 7 dias.
  await boss.work('price-refresh', async () => {
    const resolver = createPriceResolver(config);
    const deps = { prisma, resolver, sanityMaxFactor: config.PRICING_SANITY_MAX_FACTOR, logger };
    await runPriceRefresh(deps, { tier: 'hot' });

    const tailTotal = await prisma.card.count({ where: tierWhere('tail', 180) });
    const parts = 7;
    const take = Math.ceil(tailTotal / parts);
    const skip = new Date().getUTCDay() * take; // fatia do dia
    await runPriceRefresh(deps, { tier: 'tail', skip, take });
  });
  await boss.schedule('price-refresh', '0 5 * * *'); // 05:00 diário, após o backfill

  // price-snapshot (T038): fotografa as cotações do ciclo no histórico append-only.
  await boss.work('price-snapshot', async () => {
    await runPriceSnapshot({ prisma, logger });
  });
  await boss.schedule('price-snapshot', '30 5 * * *'); // 05:30 diário, após o refresh

  return boss;
}
