import PgBoss from 'pg-boss';
import type { AppConfig } from '../lib/config.js';

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
  // Handlers registrados incrementalmente por fase. Ex. (futuro):
  //   await boss.work('price-refresh', priceRefreshHandler);
  return boss;
}
