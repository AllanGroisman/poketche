import { describe, expect, it } from 'vitest';
import { computeSummary, type SummaryCapture } from '../../src/modules/scanner/summary.js';
import type { PriceLike } from '../../src/modules/pricing/current.js';

/** Resumo estatístico da revisão (T069, FR-057). Puro — sem banco. */

const price = (priceCents: number, over: Partial<PriceLike> = {}): PriceLike => ({
  condition: null,
  variant: 'normal',
  priceCents,
  source: 'intl_usd_fx',
  fxRate: null,
  fetchedAt: new Date('2026-07-16T00:00:00Z'),
  ...over,
});

const capture = (over: Partial<SummaryCapture> = {}): SummaryCapture => ({
  cardId: 'card-1',
  quantity: 1,
  condition: 'near_mint',
  variant: 'normal',
  rarity: 'Common',
  setName: 'Base Set',
  cardName: 'Pikachu',
  ...over,
});

describe('computeSummary', () => {
  it('sessão vazia não quebra nem inventa carta mais valiosa', () => {
    expect(computeSummary([], new Map(), new Set())).toMatchObject({
      total_cards: 0,
      total_value_cents: 0,
      most_valuable: null,
      in_wishlists: 0,
    });
  });

  it('conta cartas, não capturas: quantity 3 são 3 cartas (FR-053)', () => {
    const prices = new Map([['card-1', [price(1_000)]]]);
    const out = computeSummary([capture({ quantity: 3 })], prices, new Set());
    expect(out.total_cards).toBe(3);
    expect(out.total_value_cents).toBe(3_000);
  });

  it('capturas "a revisar" ficam fora das estatísticas e são contadas à parte', () => {
    const prices = new Map([['card-1', [price(1_000)]]]);
    const out = computeSummary([capture(), capture({ cardId: null })], prices, new Set());
    expect(out).toMatchObject({ total_cards: 1, needs_review: 1, total_value_cents: 1_000 });
  });

  it('carta sem cotação é reportada em vez de sumir do total (FR-016)', () => {
    const out = computeSummary([capture()], new Map(), new Set());
    expect(out).toMatchObject({ total_value_cents: 0, unpriced_cards: 1 });
  });

  it('captura sem condição definida ainda não tem preço de posição', () => {
    const prices = new Map([['card-1', [price(1_000, { condition: 'near_mint' })]]]);
    const out = computeSummary([capture({ condition: null })], prices, new Set());
    expect(out.unpriced_cards).toBe(1);
  });

  it('a mais valiosa é por unidade, não por posição', () => {
    // 10 comuns de 10,00 (100,00 no total) não superam 1 rara de 50,00.
    const prices = new Map([
      ['comum', [price(1_000)]],
      ['rara', [price(5_000)]],
    ]);
    const out = computeSummary(
      [
        capture({ cardId: 'comum', quantity: 10, cardName: 'Comum' }),
        capture({ cardId: 'rara', quantity: 1, cardName: 'Rara' }),
      ],
      prices,
      new Set(),
    );
    expect(out.most_valuable).toEqual({ card_name: 'Rara', value_cents: 5_000 });
    expect(out.total_value_cents).toBe(10 * 1_000 + 5_000);
  });

  it('agrupa por raridade e por edição somando quantidades, maior primeiro', () => {
    const prices = new Map([['card-1', [price(100)]]]);
    const out = computeSummary(
      [
        capture({ rarity: 'Common', quantity: 2, setName: 'Base Set' }),
        capture({ rarity: 'Rare', quantity: 1, setName: 'Jungle' }),
        capture({ rarity: 'Common', quantity: 1, setName: 'Base Set' }),
      ],
      prices,
      new Set(),
    );
    expect(out.by_rarity).toEqual([
      { rarity: 'Common', count: 3 },
      { rarity: 'Rare', count: 1 },
    ]);
    expect(out.by_set).toEqual([
      { set_name: 'Base Set', count: 3 },
      { set_name: 'Jungle', count: 1 },
    ]);
  });

  it('conta cartas distintas em wishlist: duas capturas da mesma carta são um desejo só', () => {
    const prices = new Map([['card-1', [price(1_000)]]]);
    const out = computeSummary(
      [capture({ condition: 'near_mint' }), capture({ condition: 'played' })],
      prices,
      new Set(['card-1']),
    );
    expect(out.in_wishlists).toBe(1);
  });

  it('carta fora de wishlist não é contada', () => {
    const out = computeSummary([capture()], new Map(), new Set(['outra-carta']));
    expect(out.in_wishlists).toBe(0);
  });
});
