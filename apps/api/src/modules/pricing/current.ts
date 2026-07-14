import type { CardPrice, Condition, PriceSource, Variant } from '@prisma/client';

/**
 * Seleção da cotação vigente a ser exibida por item da coleção (FR-012/FR-013/FR-039). Regras:
 *   - só cotações da mesma **carta+variante** do item;
 *   - condição: preferir a que casa com a condição do item; senão a cotação sem condição
 *     (fonte que não diferencia condição, ex.: internacional);
 *   - fonte: preferir a **primária BR** (Liga) sobre o **fallback internacional**.
 * Funções puras — cobertas pelos testes de dinheiro (constituição I).
 */

export type PriceLike = Pick<
  CardPrice,
  'condition' | 'variant' | 'priceCents' | 'source' | 'fxRate' | 'fetchedAt'
>;

export interface DisplayItem {
  condition: Condition;
  variant: Variant;
}

export interface SerializedPrice {
  price_cents: number;
  source: PriceSource;
  fetched_at: Date;
  fx_rate: number | null;
}

// Menor = mais prioritário. Fonte primária BR (Liga) antes do fallback internacional.
export const SOURCE_RANK: Record<PriceSource, number> = { liga_pokemon: 0, intl_usd_fx: 1 };

export function selectCurrentPrice(prices: PriceLike[], item: DisplayItem): PriceLike | null {
  const candidates = prices.filter(
    (p) => p.variant === item.variant && (p.condition === item.condition || p.condition === null),
  );
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => {
    const src = SOURCE_RANK[a.source] - SOURCE_RANK[b.source];
    if (src !== 0) return src;
    // Condição específica antes da genérica (null).
    const condRank = (p: PriceLike) => (p.condition === item.condition ? 0 : 1);
    return condRank(a) - condRank(b);
  });
  return candidates[0] ?? null;
}

export function serializePrice(price: PriceLike | null): SerializedPrice | null {
  if (!price) return null;
  return {
    price_cents: price.priceCents,
    source: price.source,
    fetched_at: price.fetchedAt,
    fx_rate: price.fxRate == null ? null : Number(price.fxRate),
  };
}
