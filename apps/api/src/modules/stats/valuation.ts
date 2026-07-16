import type { Condition, Language, Variant } from '@prisma/client';
import { selectCurrentPrice, type PriceLike } from '../pricing/current.js';
import {
  buildItemSeries,
  computeGainLoss,
  computeVariation,
  type GainLoss,
  type PeriodVariation,
  type SnapshotLike,
} from '../pricing/history.js';

/**
 * Estatísticas da coleção (US4, FR-016–FR-020a). Funções **puras** sobre os itens já
 * carregados + cotações/snapshots por carta — cobertas por testes de unidade (constituição I).
 *
 * A valoração de cada item usa a MESMA seleção de cotação vigente da listagem/detalhe
 * (`selectCurrentPrice`), garantindo que o total do dashboard bata com o `summary` do
 * `GET /collection` e com o valor da posição da tela de detalhes. Nada de interpolação: itens
 * sem cotação ficam de fora do total (contados à parte) e variações sem referência somem.
 */

export interface StatCard {
  id: string;
  number: string;
  rarity: string;
  types: string[];
  /** Nome localizado (idioma do item, fallback EN) para exibição. */
  name: string;
  imageSmallUrl: string;
  setExternalId: string;
  setName: string;
  setTotalCards: number;
}

/** Campos mínimos para valorar uma posição (usado pelo job de snapshot e pelo dashboard). */
export interface ValuableItem {
  cardId: string;
  condition: Condition;
  variant: Variant;
  quantity: number;
}

export interface StatItem extends ValuableItem {
  /** id do collection_item. */
  id: string;
  language: Language;
  acquisitionPriceCents: number | null;
  addedAt: Date;
  card: StatCard;
}

/** Valor da posição do item (cotação vigente × quantidade); `null` sem cotação (FR-016). */
export function positionValueCents(
  item: ValuableItem,
  pricesByCard: Map<string, PriceLike[]>,
): number | null {
  const price = selectCurrentPrice(pricesByCard.get(item.cardId) ?? [], item);
  return price ? price.priceCents * item.quantity : null;
}

export interface ValueSnapshot {
  total_cents: number;
  priced_items: number;
  unpriced_items: number;
}

/** Total do snapshot de valor (FR-017): soma das posições com cotação + contagens. */
export function valueSnapshot(
  items: ValuableItem[],
  pricesByCard: Map<string, PriceLike[]>,
): ValueSnapshot {
  let total = 0;
  let priced = 0;
  let unpriced = 0;
  for (const item of items) {
    const value = positionValueCents(item, pricesByCard);
    if (value == null) unpriced++;
    else {
      total += value;
      priced++;
    }
  }
  return { total_cents: total, priced_items: priced, unpriced_items: unpriced };
}

export interface Overview {
  total_cents: number;
  priced_items: number;
  unpriced_items: number;
  distinct_cards: number;
  total_quantity: number;
}

/** Valor total estimado + contagens (FR-016): soma das posições com cotação. */
export function overview(items: StatItem[], pricesByCard: Map<string, PriceLike[]>): Overview {
  const snapshot = valueSnapshot(items, pricesByCard);
  let quantity = 0;
  const cards = new Set<string>();
  for (const item of items) {
    cards.add(item.cardId);
    quantity += item.quantity;
  }
  return {
    ...snapshot,
    distinct_cards: cards.size,
    total_quantity: quantity,
  };
}

export type DistributionAxis = 'set' | 'rarity' | 'type';

export interface DistributionBucket {
  key: string;
  label: string;
  value_cents: number;
  quantity: number;
  items: number;
}

/**
 * Distribuição por edição/raridade/tipo (FR-018): valor e quantidade por grupo.
 * Observação: uma carta com múltiplos tipos entra em **cada** tipo (grupos de tipo se
 * sobrepõem), então a soma dos grupos de `type` pode exceder o total — é um ranking, não
 * uma fatia de pizza. Set e rarity são exclusivos (somam ao total).
 */
export function distribution(
  items: StatItem[],
  pricesByCard: Map<string, PriceLike[]>,
  by: DistributionAxis,
): DistributionBucket[] {
  const buckets = new Map<string, DistributionBucket>();
  const add = (key: string, label: string, value: number, quantity: number): void => {
    const bucket = buckets.get(key) ?? { key, label, value_cents: 0, quantity: 0, items: 0 };
    bucket.value_cents += value;
    bucket.quantity += quantity;
    bucket.items += 1;
    buckets.set(key, bucket);
  };
  for (const item of items) {
    const value = positionValueCents(item, pricesByCard) ?? 0;
    if (by === 'set') add(item.card.setExternalId, item.card.setName, value, item.quantity);
    else if (by === 'rarity') add(item.card.rarity, item.card.rarity, value, item.quantity);
    else {
      const types = item.card.types.length ? item.card.types : ['—'];
      for (const type of types) add(type, type, value, item.quantity);
    }
  }
  return [...buckets.values()].sort(
    (a, b) => b.value_cents - a.value_cents || b.quantity - a.quantity,
  );
}

export type RankingType = 'top_value' | 'gainers' | 'losers' | 'acquisition_pnl';

export interface RankEntry {
  item: StatItem;
  /** Valor da posição (cotação × quantidade); `null` sem cotação. */
  valueCents: number | null;
  /** Variação do período (gainers/losers). */
  variation?: PeriodVariation | null;
  /** Ganho/perda por unidade vs. aquisição (acquisition_pnl). */
  gainLoss?: GainLoss | null;
}

/** Cartas mais valiosas da coleção (FR-019): maiores valores de posição. */
export function topValue(
  items: StatItem[],
  pricesByCard: Map<string, PriceLike[]>,
  limit: number,
): RankEntry[] {
  return items
    .map((item) => ({ item, valueCents: positionValueCents(item, pricesByCard) }))
    .filter((entry): entry is RankEntry & { valueCents: number } => entry.valueCents != null)
    .sort((a, b) => b.valueCents - a.valueCents)
    .slice(0, limit);
}

/**
 * Rankings de valorização/desvalorização do período (FR-020a). Usa a mesma variação honesta
 * da US8 (referência em ou antes do início da janela; sem referência → item fora do ranking).
 */
export function movers(
  items: StatItem[],
  pricesByCard: Map<string, PriceLike[]>,
  snapsByCard: Map<string, SnapshotLike[]>,
  days: number,
  direction: 'gainers' | 'losers',
  limit: number,
  now: Date = new Date(),
): RankEntry[] {
  const entries: RankEntry[] = [];
  for (const item of items) {
    const price = selectCurrentPrice(pricesByCard.get(item.cardId) ?? [], item);
    const currentCents = price?.priceCents ?? null;
    const series = buildItemSeries(snapsByCard.get(item.cardId) ?? [], item);
    const variation = computeVariation(series, currentCents, days, now);
    if (!variation || variation.change_cents === 0) continue;
    if (direction === 'gainers' && variation.change_cents < 0) continue;
    if (direction === 'losers' && variation.change_cents > 0) continue;
    entries.push({
      item,
      valueCents: currentCents == null ? null : currentCents * item.quantity,
      variation,
    });
  }
  entries.sort((a, b) =>
    direction === 'gainers'
      ? b.variation!.change_pct - a.variation!.change_pct
      : a.variation!.change_pct - b.variation!.change_pct,
  );
  return entries.slice(0, limit);
}

/**
 * Ganho/perda vs. preço de aquisição (FR-020a): apenas itens com esse preço informado,
 * ordenados por maior ganho por unidade (base = detalhe da carta, per unit).
 */
export function acquisitionPnl(
  items: StatItem[],
  pricesByCard: Map<string, PriceLike[]>,
  limit: number,
): RankEntry[] {
  const entries: RankEntry[] = [];
  for (const item of items) {
    if (item.acquisitionPriceCents == null) continue;
    const price = selectCurrentPrice(pricesByCard.get(item.cardId) ?? [], item);
    const currentCents = price?.priceCents ?? null;
    const gainLoss = computeGainLoss([], currentCents, item.addedAt, item.acquisitionPriceCents);
    if (!gainLoss) continue; // sem cotação atual → sem P&L
    entries.push({
      item,
      valueCents: currentCents == null ? null : currentCents * item.quantity,
      gainLoss,
    });
  }
  return entries
    .sort((a, b) => b.gainLoss!.change_cents - a.gainLoss!.change_cents)
    .slice(0, limit);
}

export interface CompletionEntry {
  set_external_id: string;
  set_name: string;
  /** Cartas distintas possuídas da edição. */
  owned: number;
  /** Total de cartas da edição. */
  total: number;
  /** Percentual de completude (0–100, 1 casa). */
  pct: number;
}

/**
 * Percentual de completude (0–100, 1 casa). Compartilhado com a visão navegável por edição do
 * explorador (US10, FR-072) — a mesma carta não pode valer percentuais diferentes em duas telas.
 */
export function completionPct(owned: number, total: number): number {
  return total > 0 ? Math.round((owned / total) * 1000) / 10 : 0;
}

/** Completude por edição (FR-020): cartas distintas possuídas vs. total da edição. */
export function completion(items: StatItem[]): CompletionEntry[] {
  const bySet = new Map<string, { name: string; total: number; cards: Set<string> }>();
  for (const item of items) {
    const key = item.card.setExternalId;
    const entry = bySet.get(key) ?? {
      name: item.card.setName,
      total: item.card.setTotalCards,
      cards: new Set<string>(),
    };
    entry.cards.add(item.cardId);
    bySet.set(key, entry);
  }
  return [...bySet.entries()]
    .map(([key, entry]) => ({
      set_external_id: key,
      set_name: entry.name,
      owned: entry.cards.size,
      total: entry.total,
      pct: completionPct(entry.cards.size, entry.total),
    }))
    .sort((a, b) => b.pct - a.pct || b.owned - a.owned);
}
