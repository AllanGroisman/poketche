import { describe, expect, it } from 'vitest';
import type { PriceLike } from '../../src/modules/pricing/current.js';
import type { SnapshotLike } from '../../src/modules/pricing/history.js';
import {
  acquisitionPnl,
  completion,
  distribution,
  movers,
  overview,
  positionValueCents,
  topValue,
  valueSnapshot,
  type StatItem,
} from '../../src/modules/stats/valuation.js';

/**
 * Testes de dinheiro obrigatórios da US4 (T049, constituição I): valor total da coleção,
 * distribuições, rankings (valor, valorização/desvalorização, P&L vs. aquisição) e completude.
 * A valoração reusa `selectCurrentPrice`, então bate com a listagem/detalhe.
 */

const NOW = new Date('2026-07-15T00:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

let seq = 0;
function item(overrides: Partial<StatItem> & { cardId: string }): StatItem {
  seq += 1;
  return {
    id: `item-${seq}`,
    cardId: overrides.cardId,
    condition: overrides.condition ?? 'near_mint',
    language: overrides.language ?? 'en',
    variant: overrides.variant ?? 'normal',
    quantity: overrides.quantity ?? 1,
    acquisitionPriceCents: overrides.acquisitionPriceCents ?? null,
    addedAt: overrides.addedAt ?? daysAgo(200),
    card: {
      id: overrides.card?.id ?? `card-${overrides.cardId}`,
      number: overrides.card?.number ?? '1',
      rarity: overrides.card?.rarity ?? 'Rare',
      types: overrides.card?.types ?? ['Fire'],
      name: overrides.card?.name ?? 'Carta',
      imageSmallUrl: overrides.card?.imageSmallUrl ?? '',
      setExternalId: overrides.card?.setExternalId ?? 'set-a',
      setName: overrides.card?.setName ?? 'Set A',
      setTotalCards: overrides.card?.setTotalCards ?? 100,
    },
  };
}

/** Cotação normal sem condição (fonte internacional). */
function price(priceCents: number): PriceLike {
  return {
    condition: null,
    variant: 'normal',
    priceCents,
    source: 'intl_usd_fx',
    fxRate: null,
    fetchedAt: NOW,
  };
}

function pricesMap(entries: [string, number][]): Map<string, PriceLike[]> {
  const map = new Map<string, PriceLike[]>();
  for (const [cardId, cents] of entries) map.set(cardId, [price(cents)]);
  return map;
}

function snap(daysAgoN: number, priceCents: number): SnapshotLike {
  return {
    condition: null,
    variant: 'normal',
    priceCents,
    source: 'intl_usd_fx',
    fetchedAt: daysAgo(daysAgoN),
  };
}

describe('positionValueCents / valueSnapshot / overview', () => {
  it('valor da posição = cotação × quantidade; sem cotação → null', () => {
    const it = item({ cardId: 'a', quantity: 3 });
    expect(positionValueCents(it, pricesMap([['a', 1000]]))).toBe(3000);
    expect(positionValueCents(it, new Map())).toBeNull();
  });

  it('total soma só as posições com cotação e conta as sem preço à parte (FR-016)', () => {
    const items = [
      item({ cardId: 'a', quantity: 2 }), // 2 × 1000 = 2000
      item({ cardId: 'b', quantity: 1 }), // 1 × 500 = 500
      item({ cardId: 'c', quantity: 5 }), // sem cotação
    ];
    const prices = pricesMap([
      ['a', 1000],
      ['b', 500],
    ]);
    expect(valueSnapshot(items, prices)).toEqual({
      total_cents: 2500,
      priced_items: 2,
      unpriced_items: 1,
    });
    const ov = overview(items, prices);
    expect(ov.total_cents).toBe(2500);
    expect(ov.distinct_cards).toBe(3);
    expect(ov.total_quantity).toBe(8);
  });
});

describe('distribution', () => {
  it('por edição soma valor e quantidade por set (exclusivo)', () => {
    const items = [
      item({ cardId: 'a', quantity: 2, card: { setExternalId: 's1', setName: 'S1' } as never }),
      item({ cardId: 'b', quantity: 1, card: { setExternalId: 's1', setName: 'S1' } as never }),
      item({ cardId: 'c', quantity: 1, card: { setExternalId: 's2', setName: 'S2' } as never }),
    ];
    const prices = pricesMap([
      ['a', 1000],
      ['b', 500],
      ['c', 3000],
    ]);
    const buckets = distribution(items, prices, 'set');
    // ordenado por valor desc: s1 = 2500, s2 = 3000 → s2 primeiro
    expect(buckets.map((b) => b.key)).toEqual(['s2', 's1']);
    const s1 = buckets.find((b) => b.key === 's1')!;
    expect(s1).toMatchObject({ value_cents: 2500, quantity: 3, items: 2 });
  });

  it('por tipo conta a carta em cada tipo (grupos sobrepostos)', () => {
    const items = [
      item({ cardId: 'a', card: { types: ['Fire', 'Flying'] } as never }),
      item({ cardId: 'b', card: { types: ['Fire'] } as never }),
    ];
    const prices = pricesMap([
      ['a', 1000],
      ['b', 2000],
    ]);
    const buckets = distribution(items, prices, 'type');
    const fire = buckets.find((b) => b.key === 'Fire')!;
    const flying = buckets.find((b) => b.key === 'Flying')!;
    expect(fire.value_cents).toBe(3000); // ambas
    expect(flying.value_cents).toBe(1000); // só a carta a
  });
});

describe('topValue', () => {
  it('ordena por valor da posição desc e exclui sem cotação', () => {
    const items = [
      item({ cardId: 'a', quantity: 1 }), // 1000
      item({ cardId: 'b', quantity: 3 }), // 900
      item({ cardId: 'c', quantity: 1 }), // sem preço
    ];
    const prices = pricesMap([
      ['a', 1000],
      ['b', 300],
    ]);
    const ranked = topValue(items, prices, 10);
    expect(ranked.map((e) => e.item.cardId)).toEqual(['a', 'b']);
    expect(ranked[0]!.valueCents).toBe(1000);
    expect(ranked[1]!.valueCents).toBe(900);
  });
});

describe('movers', () => {
  const items = [
    item({ cardId: 'up' }),
    item({ cardId: 'down' }),
    item({ cardId: 'flat' }),
    item({ cardId: 'nogap' }),
  ];
  const prices = pricesMap([
    ['up', 1500],
    ['down', 800],
    ['flat', 1000],
    ['nogap', 1200],
  ]);
  // Referência em ou antes do corte de 30d para up/down/flat; nogap só tem ponto recente.
  const snaps = new Map<string, SnapshotLike[]>([
    ['up', [snap(40, 1000), snap(1, 1500)]],
    ['down', [snap(40, 1000), snap(1, 800)]],
    ['flat', [snap(40, 1000), snap(1, 1000)]],
    ['nogap', [snap(5, 1200)]],
  ]);

  it('gainers: só valorizações, ordenadas por % desc; ignora estável e sem referência', () => {
    const ranked = movers(items, prices, snaps, 30, 'gainers', 10, NOW);
    expect(ranked.map((e) => e.item.cardId)).toEqual(['up']);
    expect(ranked[0]!.variation).toMatchObject({ change_cents: 500, change_pct: 50 });
  });

  it('losers: só desvalorizações, ordenadas por % asc', () => {
    const ranked = movers(items, prices, snaps, 30, 'losers', 10, NOW);
    expect(ranked.map((e) => e.item.cardId)).toEqual(['down']);
    expect(ranked[0]!.variation!.change_cents).toBe(-200);
  });
});

describe('acquisitionPnl', () => {
  it('só itens com preço de aquisição, ganho por unidade, ordenado desc (FR-020a)', () => {
    const items = [
      item({ cardId: 'a', acquisitionPriceCents: 600 }), // atual 1000 → +400
      item({ cardId: 'b', acquisitionPriceCents: 1200 }), // atual 1000 → -200
      item({ cardId: 'c' }), // sem preço de compra → fora
    ];
    const prices = pricesMap([
      ['a', 1000],
      ['b', 1000],
      ['c', 5000],
    ]);
    const ranked = acquisitionPnl(items, prices, 10);
    expect(ranked.map((e) => e.item.cardId)).toEqual(['a', 'b']);
    expect(ranked[0]!.gainLoss).toMatchObject({ basis: 'acquisition', change_cents: 400 });
    expect(ranked[1]!.gainLoss!.change_cents).toBe(-200);
  });
});

describe('completion', () => {
  it('conta cartas distintas possuídas por edição e calcula %', () => {
    const items = [
      // Mesma carta em duas condições → conta 1 distinta.
      item({
        cardId: 'x',
        condition: 'mint',
        card: { setExternalId: 's1', setTotalCards: 4 } as never,
      }),
      item({
        cardId: 'x',
        condition: 'played',
        card: { setExternalId: 's1', setTotalCards: 4 } as never,
      }),
      item({ cardId: 'y', card: { setExternalId: 's1', setTotalCards: 4 } as never }),
      item({ cardId: 'z', card: { setExternalId: 's2', setTotalCards: 10 } as never }),
    ];
    const sets = completion(items);
    const s1 = sets.find((s) => s.set_external_id === 's1')!;
    expect(s1.owned).toBe(2); // x e y
    expect(s1.total).toBe(4);
    expect(s1.pct).toBe(50);
    // ordenado por pct desc: s1 (50%) antes de s2 (10%)
    expect(sets[0]!.set_external_id).toBe('s1');
  });
});
