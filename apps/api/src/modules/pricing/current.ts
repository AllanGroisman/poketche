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

/** Variante de referência de mercado, na ordem em que a carta costuma ser negociada. */
const VARIANT_PREFERENCE: Variant[] = ['normal', 'holo', 'reverse_foil'];

/** Condição sem contexto de item: a genérica da fonte antes da melhor conservada. */
const condRank = (c: Condition | null) => (c === null ? 0 : c === 'near_mint' ? 1 : 2);

/**
 * Preferência entre cotações **da mesma variante** de uma carta, sem contexto de item: fonte
 * primária BR antes do fallback internacional; entre fontes iguais, a cotação sem condição
 * (preço de mercado genérico) antes da melhor conservada.
 */
function byMarketPreference(a: PriceLike, b: PriceLike): number {
  const src = SOURCE_RANK[a.source] - SOURCE_RANK[b.source];
  if (src !== 0) return src;
  return condRank(a.condition) - condRank(b.condition);
}

/**
 * Cotação de referência de mercado de uma **carta**, sem contexto de item (US10, FR-070): o
 * catálogo mostra a carta, não uma posse — não há condição/variante para casar. Regras:
 *   - variante: a mais próxima do padrão de negociação entre as disponíveis (normal → holo →
 *     reverse foil), coerente com a série de referência do histórico (`buildCardSeries`);
 *   - fonte: primária BR antes do fallback internacional (mesma regra do item);
 *   - condição: preferir a cotação **sem condição** (preço de mercado genérico da fonte); entre
 *     cotações com condição, a melhor conservada — é a referência usual de catálogo.
 * O chamador deve exibir `condition`/`variant` junto do preço: sem o contexto do item, o número
 * sozinho seria ambíguo. Função pura — coberta pelos testes de dinheiro (constituição I).
 */
export function selectCardMarketPrice(prices: PriceLike[]): PriceLike | null {
  if (prices.length === 0) return null;
  const variant = VARIANT_PREFERENCE.find((v) => prices.some((p) => p.variant === v));
  if (!variant) return null;
  const candidates = prices.filter((p) => p.variant === variant).sort(byMarketPreference);
  return candidates[0] ?? null;
}

/**
 * Cotação que o **preço-alvo de wishlist** enfrenta (US9, FR-046): a wishlist é no nível da
 * carta canônica — o usuário não escolhe variante —, então o alvo é avaliado contra o **menor
 * preço vigente entre as variantes** (data-model §Wishlists), e quem exibe/notifica indica qual
 * variante atingiu o alvo.
 *
 * Note que "menor entre as variantes" **não** é `min()` sobre todas as cotações: dentro de uma
 * variante ainda vale a preferência de fonte/condição (`byMarketPreference`) — senão o alvo
 * seria comparado contra o fallback internacional só por ele estar mais barato que a fonte
 * primária, notificando um preço que o app não exibe. Escolhe-se a cotação de cada variante e
 * só então a mais barata entre elas. Empate resolve pela ordem usual de negociação.
 * Função pura — coberta pelos testes de dinheiro (constituição I).
 */
export function selectWishlistPrice(prices: PriceLike[]): PriceLike | null {
  const perVariant = VARIANT_PREFERENCE.map(
    (v) => prices.filter((p) => p.variant === v).sort(byMarketPreference)[0],
  ).filter((p): p is PriceLike => p != null);
  if (perVariant.length === 0) return null;
  // Estável: `VARIANT_PREFERENCE` já ordena os empates de preço pela ordem de negociação.
  return perVariant.reduce((cheapest, p) => (p.priceCents < cheapest.priceCents ? p : cheapest));
}
