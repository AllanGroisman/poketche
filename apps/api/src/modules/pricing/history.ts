import type { Condition, PriceSource, Variant } from '@prisma/client';
import { SOURCE_RANK } from './current.js';

/**
 * Histórico e variações de preço por carta/item (US8, FR-038/040/042). Funções **puras**
 * sobre snapshots (`card_price_snapshot`) — cobertas pelos testes de dinheiro (constituição I).
 *
 * Regras honestas (FR-042): nunca interpolamos. A variação de um período só existe quando há
 * um snapshot de referência **em ou antes** do início da janela; caso contrário fica `null`
 * ("indisponível"). Com menos de 2 snapshots não há gráfico ("histórico indisponível").
 */

const DAY_MS = 86_400_000;

export interface SnapshotLike {
  condition: Condition | null;
  variant: Variant;
  priceCents: number;
  source: PriceSource;
  fetchedAt: Date;
}

/** Ponto da série temporal (um preço por instante de coleta). */
export interface PricePoint {
  t: Date;
  priceCents: number;
}

export interface PeriodVariation {
  from_cents: number;
  to_cents: number;
  change_cents: number;
  /** Percentual com 1 casa (ex.: 12.3). */
  change_pct: number;
}

export interface GainLoss extends PeriodVariation {
  /** `acquisition`: vs. preço de compra informado; `added`: vs. preço desde a adição. */
  basis: 'acquisition' | 'added';
}

export interface HighLow {
  high_cents: number;
  low_cents: number;
}

export type Trend = 'up' | 'down' | 'flat';

/** Percentual (1 casa) de `from`→`to`; 0 se base não positiva (evita divisão inválida). */
function pct(from: number, to: number): number {
  if (from <= 0) return 0;
  return Math.round(((to - from) / from) * 1000) / 10;
}

/** Preço do último ponto com `t <= asOf` (série já ordenada asc); null se nenhum. */
export function priceAsOf(points: PricePoint[], asOf: Date): number | null {
  let found: number | null = null;
  for (const p of points) {
    if (p.t.getTime() <= asOf.getTime()) found = p.priceCents;
    else break;
  }
  return found;
}

/** Preço mais próximo de `date`: último em ou antes; senão o primeiro depois; senão null. */
function priceNear(points: PricePoint[], date: Date): number | null {
  const before = priceAsOf(points, date);
  if (before != null) return before;
  return points[0]?.priceCents ?? null;
}

/**
 * Variação num período de `days`: referência = snapshot em ou antes de (now − days).
 * `null` quando não há referência (histórico não alcança a janela) — sem interpolar (FR-042).
 */
export function computeVariation(
  points: PricePoint[],
  currentCents: number | null,
  days: number,
  now: Date = new Date(),
): PeriodVariation | null {
  if (currentCents == null) return null;
  const cutoff = new Date(now.getTime() - days * DAY_MS);
  const ref = priceAsOf(points, cutoff);
  if (ref == null) return null;
  return {
    from_cents: ref,
    to_cents: currentCents,
    change_cents: currentCents - ref,
    change_pct: pct(ref, currentCents),
  };
}

/**
 * Ganho/perda (FR-040): vs. preço de aquisição quando informado; senão vs. o preço desde a
 * data de adição do item. `null` quando não há preço atual nem referência de adição.
 */
export function computeGainLoss(
  points: PricePoint[],
  currentCents: number | null,
  addedAt: Date,
  acquisitionPriceCents: number | null,
): GainLoss | null {
  if (currentCents == null) return null;
  if (acquisitionPriceCents != null) {
    return {
      basis: 'acquisition',
      from_cents: acquisitionPriceCents,
      to_cents: currentCents,
      change_cents: currentCents - acquisitionPriceCents,
      change_pct: pct(acquisitionPriceCents, currentCents),
    };
  }
  const ref = priceNear(points, addedAt);
  if (ref == null) return null;
  return {
    basis: 'added',
    from_cents: ref,
    to_cents: currentCents,
    change_cents: currentCents - ref,
    change_pct: pct(ref, currentCents),
  };
}

/** Maior/menor preço registrado na série disponível; null se vazia. */
export function highLow(points: PricePoint[]): HighLow | null {
  if (points.length === 0) return null;
  let high = points[0]!.priceCents;
  let low = points[0]!.priceCents;
  for (const p of points) {
    if (p.priceCents > high) high = p.priceCents;
    if (p.priceCents < low) low = p.priceCents;
  }
  return { high_cents: high, low_cents: low };
}

/** Indicador de tendência para a listagem (FR-041): sinal da variação de `days` (default 7d). */
export function computeTrend(
  points: PricePoint[],
  currentCents: number | null,
  days = 7,
  now: Date = new Date(),
): Trend | null {
  const v = computeVariation(points, currentCents, days, now);
  if (!v) return null;
  if (v.change_cents > 0) return 'up';
  if (v.change_cents < 0) return 'down';
  return 'flat';
}

/** Ordena e reduz um grupo de snapshots do mesmo instante a um único (melhor fonte/condição). */
function bestOfGroup(group: SnapshotLike[], itemCondition: Condition | null): SnapshotLike {
  return [...group].sort((a, b) => {
    const src = SOURCE_RANK[a.source] - SOURCE_RANK[b.source];
    if (src !== 0) return src;
    // Condição específica do item antes da genérica (null); depois null antes de outra.
    const rank = (c: Condition | null) => (c === itemCondition ? 0 : c === null ? 1 : 2);
    return rank(a.condition) - rank(b.condition);
  })[0]!;
}

/** Agrupa snapshots por instante, escolhe 1 por instante e devolve a série ordenada asc. */
function toSeries(snaps: SnapshotLike[], itemCondition: Condition | null): PricePoint[] {
  const byTime = new Map<number, SnapshotLike[]>();
  for (const s of snaps) {
    const key = s.fetchedAt.getTime();
    const list = byTime.get(key) ?? [];
    list.push(s);
    byTime.set(key, list);
  }
  return [...byTime.entries()]
    .sort(([a], [b]) => a - b)
    .map(([time, group]) => ({
      t: new Date(time),
      priceCents: bestOfGroup(group, itemCondition).priceCents,
    }));
}

/**
 * Série temporal de um **item** (carta+condição+variante): mesma variante e condição do item
 * ou cotação sem condição (fonte que não a diferencia) — coerente com `selectCurrentPrice`.
 */
export function buildItemSeries(
  snaps: SnapshotLike[],
  item: { condition: Condition; variant: Variant },
): PricePoint[] {
  const relevant = snaps.filter(
    (s) => s.variant === item.variant && (s.condition === item.condition || s.condition === null),
  );
  return toSeries(relevant, item.condition);
}

const VARIANT_PREFERENCE: Variant[] = ['normal', 'holo', 'reverse_foil'];

/**
 * Série de referência de mercado de uma **carta** (sem contexto de item): escolhe a variante
 * com mais pontos (desempate por preferência) e reduz por melhor fonte a cada instante.
 */
export function buildCardSeries(snaps: SnapshotLike[]): {
  variant: Variant | null;
  points: PricePoint[];
} {
  if (snaps.length === 0) return { variant: null, points: [] };
  const counts = new Map<Variant, number>();
  for (const s of snaps) counts.set(s.variant, (counts.get(s.variant) ?? 0) + 1);
  const variant = [...counts.keys()].sort((a, b) => {
    const diff = (counts.get(b) ?? 0) - (counts.get(a) ?? 0);
    if (diff !== 0) return diff;
    return VARIANT_PREFERENCE.indexOf(a) - VARIANT_PREFERENCE.indexOf(b);
  })[0]!;
  const points = toSeries(
    snaps.filter((s) => s.variant === variant),
    null,
  );
  return { variant, points };
}

/** Filtra a série a um período em dias a partir de agora; `all` (undefined) mantém tudo. */
export function sliceByPeriod(
  points: PricePoint[],
  days: number | null,
  now: Date = new Date(),
): PricePoint[] {
  if (days == null) return points;
  const cutoff = now.getTime() - days * DAY_MS;
  return points.filter((p) => p.t.getTime() >= cutoff);
}
