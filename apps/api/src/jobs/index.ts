import PgBoss from 'pg-boss';
import type { AppConfig } from '../lib/config.js';
import { prisma } from '../lib/prisma.js';
import { createCatalogProvider } from '../integrations/catalog/index.js';
import { createImageStore } from '../integrations/storage/r2.js';
import { runCatalogSync } from './catalog-sync.js';
import { runImageBackfill } from './image-backfill.js';

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

  // Demais handlers registrados incrementalmente por fase:
  //   price-refresh/price-snapshot (T038), etc.
  return boss;
}
