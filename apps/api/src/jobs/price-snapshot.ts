import type { PrismaClient } from '@prisma/client';

/**
 * Job `price-snapshot` (T038) — após cada ciclo de `price-refresh`, copia as cotações
 * vigentes (`card_price`) para o histórico **append-only** `card_price_snapshot` (FR-037).
 * Base dos gráficos, variações 7/30/90d, maior/menor, tendência e rankings (US8/US4).
 *
 * Por padrão fotografa apenas as cotações **atualizadas no ciclo** (`fetched_at >= since`),
 * evitando duplicar pontos idênticos da cauda que não foi recotada no dia.
 */

export interface PriceSnapshotDeps {
  prisma: Pick<PrismaClient, '$executeRaw'>;
  logger?: { info: (msg: string) => void };
}

export interface PriceSnapshotOptions {
  /** Só fotografa cotações com `fetched_at >= since` (default: início do dia UTC). */
  since?: Date;
}

function startOfUtcDay(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export async function runPriceSnapshot(
  deps: PriceSnapshotDeps,
  options: PriceSnapshotOptions = {},
): Promise<{ snapshots: number }> {
  const { prisma } = deps;
  const since = options.since ?? startOfUtcDay();

  const snapshots = await prisma.$executeRaw`
    INSERT INTO card_price_snapshot (id, card_id, condition, variant, price_cents, source, fx_rate, fetched_at)
    SELECT gen_random_uuid(), card_id, condition, variant, price_cents, source, fx_rate, fetched_at
    FROM card_price
    WHERE fetched_at >= ${since}
  `;

  deps.logger?.info(
    `price-snapshot: ${snapshots} cotações fotografadas (desde ${since.toISOString()})`,
  );
  return { snapshots };
}
