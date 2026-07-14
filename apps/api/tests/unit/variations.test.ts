import { describe, expect, it } from 'vitest';
import {
  buildCardSeries,
  buildItemSeries,
  computeGainLoss,
  computeTrend,
  computeVariation,
  highLow,
  priceAsOf,
  sliceByPeriod,
  type PricePoint,
  type SnapshotLike,
} from '../../src/modules/pricing/history.js';

/**
 * Testes de dinheiro obrigatórios da US8 (T044, constituição I): variações por período com
 * referência honesta (sem interpolar lacunas), maior/menor, ganho/perda vs. aquisição e desde
 * a adição, tendência, e construção da série item/carta a partir de snapshots.
 */

const NOW = new Date('2026-07-14T00:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

/** Série ascendente conveniente a partir de pares [dias atrás, centavos]. */
function series(pairs: [number, number][]): PricePoint[] {
  return pairs
    .map(([d, c]) => ({ t: daysAgo(d), priceCents: c }))
    .sort((a, b) => a.t.getTime() - b.t.getTime());
}

describe('priceAsOf', () => {
  it('pega o último ponto em ou antes da data (sem interpolar)', () => {
    const s = series([
      [10, 1000],
      [3, 1200],
    ]);
    expect(priceAsOf(s, daysAgo(3))).toBe(1200);
    expect(priceAsOf(s, daysAgo(5))).toBe(1000); // entre 10d e 3d → usa o de 10d
    expect(priceAsOf(s, daysAgo(20))).toBeNull(); // antes de tudo → sem referência
  });
});

describe('computeVariation', () => {
  it('calcula % e centavos com referência ≤ início da janela', () => {
    const s = series([
      [30, 1000],
      [7, 1000],
      [1, 1500],
    ]);
    const v = computeVariation(s, 1500, 7, NOW);
    expect(v).toEqual({ from_cents: 1000, to_cents: 1500, change_cents: 500, change_pct: 50 });
  });

  it('retorna null quando o histórico não alcança a janela (lacuna, sem interpolar)', () => {
    const s = series([[5, 1200]]); // nada em ou antes de 7 dias atrás
    expect(computeVariation(s, 1300, 7, NOW)).toBeNull();
  });

  it('retorna null sem preço atual', () => {
    expect(computeVariation(series([[30, 1000]]), null, 7, NOW)).toBeNull();
  });

  it('variação negativa é reportada com sinal', () => {
    const s = series([
      [40, 2000],
      [2, 2000],
    ]);
    const v = computeVariation(s, 1500, 30, NOW);
    expect(v).toMatchObject({ change_cents: -500, change_pct: -25 });
  });
});

describe('computeGainLoss', () => {
  const s = series([
    [40, 800],
    [2, 900],
  ]);

  it('usa o preço de aquisição quando informado', () => {
    const g = computeGainLoss(s, 1000, daysAgo(30), 600);
    expect(g).toEqual({
      basis: 'acquisition',
      from_cents: 600,
      to_cents: 1000,
      change_cents: 400,
      change_pct: 66.7,
    });
  });

  it('sem aquisição, usa o preço desde a adição (ponto ≤ data de adição)', () => {
    const g = computeGainLoss(s, 1000, daysAgo(30), null);
    expect(g).toMatchObject({ basis: 'added', from_cents: 800, change_cents: 200 });
  });

  it('sem aquisição e sem ponto anterior à adição, usa o primeiro ponto observado', () => {
    const g = computeGainLoss(s, 1000, daysAgo(90), null); // adição antes de tudo
    expect(g).toMatchObject({ basis: 'added', from_cents: 800 });
  });

  it('retorna null quando não há preço atual', () => {
    expect(computeGainLoss(s, null, daysAgo(30), 600)).toBeNull();
  });
});

describe('highLow', () => {
  it('maior/menor sobre a série disponível', () => {
    const s = series([
      [30, 1000],
      [10, 1500],
      [2, 800],
    ]);
    expect(highLow(s)).toEqual({ high_cents: 1500, low_cents: 800 });
  });

  it('null para série vazia', () => {
    expect(highLow([])).toBeNull();
  });
});

describe('computeTrend', () => {
  it('classifica alta/baixa/estável pela variação de 7d', () => {
    const up = series([
      [10, 1000],
      [1, 1200],
    ]);
    const down = series([
      [10, 1200],
      [1, 1000],
    ]);
    const flat = series([
      [10, 1000],
      [1, 1000],
    ]);
    expect(computeTrend(up, 1200, 7, NOW)).toBe('up');
    expect(computeTrend(down, 1000, 7, NOW)).toBe('down');
    expect(computeTrend(flat, 1000, 7, NOW)).toBe('flat');
  });

  it('null sem referência para o período', () => {
    expect(computeTrend(series([[3, 1000]]), 1100, 7, NOW)).toBeNull();
  });
});

describe('buildItemSeries', () => {
  const snap = (over: Partial<SnapshotLike>): SnapshotLike => ({
    condition: null,
    variant: 'normal',
    priceCents: 1000,
    source: 'intl_usd_fx',
    fetchedAt: daysAgo(1),
    ...over,
  });

  it('filtra por variante e condição do item (ou cotação sem condição)', () => {
    const snaps = [
      snap({ variant: 'holo', priceCents: 5000, fetchedAt: daysAgo(1) }), // variante errada → fora
      snap({ variant: 'normal', condition: 'played', priceCents: 999, fetchedAt: daysAgo(1) }), // condição errada → fora
      snap({ variant: 'normal', condition: 'near_mint', priceCents: 1200, fetchedAt: daysAgo(2) }),
      snap({ variant: 'normal', condition: null, priceCents: 1100, fetchedAt: daysAgo(3) }),
    ];
    const pts = buildItemSeries(snaps, { condition: 'near_mint', variant: 'normal' });
    expect(pts.map((p) => p.priceCents)).toEqual([1100, 1200]); // ordenados asc por tempo
  });

  it('reduz um mesmo instante à melhor fonte (Liga antes do intl)', () => {
    const t = daysAgo(1);
    const snaps = [
      snap({ source: 'intl_usd_fx', condition: null, priceCents: 1000, fetchedAt: t }),
      snap({ source: 'liga_pokemon', condition: 'near_mint', priceCents: 900, fetchedAt: t }),
    ];
    const pts = buildItemSeries(snaps, { condition: 'near_mint', variant: 'normal' });
    expect(pts).toHaveLength(1);
    expect(pts[0]!.priceCents).toBe(900);
  });
});

describe('buildCardSeries', () => {
  const snap = (variant: SnapshotLike['variant'], d: number, c: number): SnapshotLike => ({
    condition: null,
    variant,
    priceCents: c,
    source: 'intl_usd_fx',
    fetchedAt: daysAgo(d),
  });

  it('escolhe a variante com mais pontos como referência de mercado', () => {
    const snaps = [
      snap('normal', 3, 1000),
      snap('normal', 2, 1100),
      snap('holo', 3, 5000), // holo tem menos pontos → não escolhida
    ];
    const { variant, points } = buildCardSeries(snaps);
    expect(variant).toBe('normal');
    expect(points.map((p) => p.priceCents)).toEqual([1000, 1100]);
  });

  it('série vazia retorna variante null', () => {
    expect(buildCardSeries([])).toEqual({ variant: null, points: [] });
  });
});

describe('sliceByPeriod', () => {
  it('recorta a série ao período em dias; null mantém tudo', () => {
    const s = series([
      [90, 1000],
      [30, 1100],
      [2, 1200],
    ]);
    expect(sliceByPeriod(s, 7, NOW).map((p) => p.priceCents)).toEqual([1200]);
    expect(sliceByPeriod(s, null, NOW)).toHaveLength(3);
  });
});
