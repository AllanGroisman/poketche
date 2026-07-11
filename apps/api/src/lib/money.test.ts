import { describe, it, expect } from 'vitest';
import {
  MoneyError,
  reaisToCents,
  formatBRL,
  lineTotalCents,
  shippingForGroupCents,
  computeOrderTotals,
} from './money.js';

describe('reaisToCents', () => {
  it('arredonda ao centavo mais próximo', () => {
    expect(reaisToCents(12.34)).toBe(1234);
    expect(reaisToCents(0.1)).toBe(10);
    expect(reaisToCents(9.999)).toBe(1000);
  });
  it('rejeita valores não finitos', () => {
    expect(() => reaisToCents(Number.NaN)).toThrow(MoneyError);
    expect(() => reaisToCents(Infinity)).toThrow(MoneyError);
  });
});

describe('formatBRL', () => {
  it('formata centavos como moeda brasileira', () => {
    const out = formatBRL(123456);
    expect(out).toContain('R$');
    expect(out).toContain('1.234,56');
  });
  it('exige inteiro', () => {
    expect(() => formatBRL(10.5)).toThrow(MoneyError);
  });
});

describe('lineTotalCents', () => {
  it('multiplica preço unitário pela quantidade', () => {
    expect(lineTotalCents(1500, 3)).toBe(4500);
  });
  it('rejeita quantidade inválida', () => {
    expect(() => lineTotalCents(1500, 0)).toThrow(MoneyError);
    expect(() => lineTotalCents(1500, -1)).toThrow(MoneyError);
    expect(() => lineTotalCents(1500, 1.5)).toThrow(MoneyError);
  });
  it('rejeita preço não inteiro', () => {
    expect(() => lineTotalCents(15.5, 2)).toThrow(MoneyError);
  });
});

describe('shippingForGroupCents', () => {
  it('usa o maior frete entre os anúncios (envio único)', () => {
    expect(shippingForGroupCents([1000, 2500, 500])).toBe(2500);
  });
  it('grupo vazio => sem frete', () => {
    expect(shippingForGroupCents([])).toBe(0);
  });
  it('frete incluso (0) não adiciona frete', () => {
    expect(shippingForGroupCents([0, 0])).toBe(0);
  });
});

describe('computeOrderTotals', () => {
  it('total = itens + frete; comissão só sobre itens; net = itens - comissão + frete', () => {
    const t = computeOrderTotals({
      itemsTotalCents: 10000,
      shippingPriceCents: 2000,
      commissionPct: 0.1,
    });
    expect(t.totalCents).toBe(12000);
    expect(t.commissionCents).toBe(1000);
    expect(t.sellerNetCents).toBe(11000); // 10000 - 1000 + 2000
  });

  it('mantém a invariante item = comissão + (net - frete) sob arredondamento', () => {
    // 33% de 999 = 329,67 -> 330
    const t = computeOrderTotals({
      itemsTotalCents: 999,
      shippingPriceCents: 0,
      commissionPct: 0.33,
    });
    expect(t.commissionCents).toBe(330);
    expect(t.sellerNetCents).toBe(669);
    expect(t.commissionCents + t.sellerNetCents).toBe(t.totalCents);
  });

  it('frete incluso (0) => net = itens - comissão', () => {
    const t = computeOrderTotals({
      itemsTotalCents: 5000,
      shippingPriceCents: 0,
      commissionPct: 0.15,
    });
    expect(t.totalCents).toBe(5000);
    expect(t.commissionCents).toBe(750);
    expect(t.sellerNetCents).toBe(4250);
  });

  it('rejeita comissão fora de [0,1) e valores negativos', () => {
    expect(() =>
      computeOrderTotals({ itemsTotalCents: 100, shippingPriceCents: 0, commissionPct: 1 }),
    ).toThrow(MoneyError);
    expect(() =>
      computeOrderTotals({ itemsTotalCents: -1, shippingPriceCents: 0, commissionPct: 0.1 }),
    ).toThrow(MoneyError);
    expect(() =>
      computeOrderTotals({ itemsTotalCents: 100, shippingPriceCents: -5, commissionPct: 0.1 }),
    ).toThrow(MoneyError);
  });
});
