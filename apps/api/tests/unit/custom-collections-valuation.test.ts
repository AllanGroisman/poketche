import { describe, expect, it } from 'vitest';
import { sliceSummary } from '../../src/modules/collections/routes.js';
import { overview, type StatItem } from '../../src/modules/stats/valuation.js';
import type { PriceLike } from '../../src/modules/pricing/current.js';

/**
 * Guarda de não-drift (T035): o resumo do recorte das coleções personalizadas DEVE bater com a
 * valoração do dashboard (`overview`) para o mesmo conjunto de itens. Se alguém reimplementar o
 * cálculo do recorte, este teste quebra — carta e coleção nunca podem discordar de preço.
 */

const price = (cardId: string, priceCents: number): PriceLike & { cardId: string } => ({
  cardId,
  condition: null,
  variant: 'normal',
  priceCents,
  source: 'intl_usd_fx',
  fxRate: null,
  fetchedAt: new Date(),
});

function statItem(id: string, cardId: string, quantity: number): StatItem {
  return {
    id,
    cardId,
    condition: 'near_mint',
    language: 'en',
    variant: 'normal',
    quantity,
    acquisitionPriceCents: null,
    addedAt: new Date(),
    card: {
      id: cardId,
      number: '1',
      rarity: 'Rare',
      types: ['Fire'],
      name: 'X',
      imageSmallUrl: '',
      setExternalId: 'set',
      setName: 'Set',
      setTotalCards: 1,
    },
  };
}

describe('sliceSummary vs overview (não-drift US4)', () => {
  it('produz total/priced/unpriced/distinct/quantity idênticos a overview', () => {
    const pricesByCard = new Map<string, PriceLike[]>([
      ['a', [price('a', 10_000)]],
      ['b', [price('b', 5_000)]],
      // 'c' sem cotação
    ]);
    const items = [
      statItem('i1', 'a', 2), // 20.000
      statItem('i2', 'b', 1), // 5.000
      statItem('i3', 'c', 3), // sem preço
    ];

    const expected = overview(items, pricesByCard);
    const got = sliceSummary(items, pricesByCard);

    expect(got).toEqual({
      total_cents: expected.total_cents,
      priced_items: expected.priced_items,
      unpriced_items: expected.unpriced_items,
      distinct_cards: expected.distinct_cards,
      total_quantity: expected.total_quantity,
    });
    expect(got.total_cents).toBe(25_000);
    expect(got.unpriced_items).toBe(1);
  });

  it('recorte vazio → tudo zero', () => {
    expect(sliceSummary([], new Map())).toEqual({
      total_cents: 0,
      priced_items: 0,
      unpriced_items: 0,
      distinct_cards: 0,
      total_quantity: 0,
    });
  });
});
