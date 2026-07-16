import type { Condition, Variant } from '@prisma/client';
import { selectCurrentPrice, type PriceLike } from '../pricing/current.js';

/**
 * Resumo estatístico da sessão (T069, FR-057): total de cartas, valor de mercado estimado,
 * distribuição por raridade e por edição, carta mais valiosa e quantas estão em wishlists.
 *
 * Função pura, sem banco: o chamador carrega capturas, cotações e wishlists e passa aqui. Isso é o
 * que torna as regras abaixo testáveis sem fixture — e elas têm mais arestas do que parece.
 */

export interface SummaryCapture {
  cardId: string | null;
  quantity: number;
  condition: Condition | null;
  variant: Variant;
  rarity: string;
  setName: string;
  cardName: string;
}

export interface ScanSummary {
  total_cards: number;
  /** Capturas ainda sem carta resolvida — ficam fora de todo o resto. */
  needs_review: number;
  total_value_cents: number;
  /** Cartas resolvidas mas sem cotação: o total mentiria por omissão sem isto (FR-016). */
  unpriced_cards: number;
  by_rarity: { rarity: string; count: number }[];
  by_set: { set_name: string; count: number }[];
  most_valuable: { card_name: string; value_cents: number } | null;
  in_wishlists: number;
}

function tally(entries: { key: string; count: number }[]): { key: string; count: number }[] {
  const acc = new Map<string, number>();
  for (const e of entries) acc.set(e.key, (acc.get(e.key) ?? 0) + e.count);
  return [...acc].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
}

export function computeSummary(
  captures: SummaryCapture[],
  pricesByCard: Map<string, PriceLike[]>,
  wishlistCardIds: Set<string>,
): ScanSummary {
  const resolved = captures.filter((c) => c.cardId != null);

  let totalValue = 0;
  let unpriced = 0;
  let mostValuable: ScanSummary['most_valuable'] = null;

  for (const c of resolved) {
    const prices = pricesByCard.get(c.cardId!) ?? [];
    // Mesma seleção de cotação da coleção: preferência de fonte dentro da condição/variante da
    // captura. Captura "a revisar" sem condição ainda não tem posição de preço definida.
    const price = c.condition
      ? selectCurrentPrice(prices, { condition: c.condition, variant: c.variant })
      : null;
    if (!price) {
      unpriced++;
      continue;
    }
    const value = price.priceCents * c.quantity;
    totalValue += value;
    // Carta mais valiosa é por unidade, não por posição: 10 comuns não são "a mais valiosa".
    if (!mostValuable || price.priceCents > mostValuable.value_cents) {
      mostValuable = { card_name: c.cardName, value_cents: price.priceCents };
    }
  }

  return {
    // Conta cartas, não capturas: uma captura com quantity 3 são 3 cartas (FR-053).
    total_cards: resolved.reduce((n, c) => n + c.quantity, 0),
    needs_review: captures.length - resolved.length,
    total_value_cents: totalValue,
    unpriced_cards: unpriced,
    by_rarity: tally(resolved.map((c) => ({ key: c.rarity, count: c.quantity }))).map((e) => ({
      rarity: e.key,
      count: e.count,
    })),
    by_set: tally(resolved.map((c) => ({ key: c.setName, count: c.quantity }))).map((e) => ({
      set_name: e.key,
      count: e.count,
    })),
    most_valuable: mostValuable,
    // Cartas distintas em wishlist, não capturas: duas capturas da mesma carta são um desejo só.
    in_wishlists: new Set(resolved.map((c) => c.cardId!).filter((id) => wishlistCardIds.has(id)))
      .size,
  };
}
