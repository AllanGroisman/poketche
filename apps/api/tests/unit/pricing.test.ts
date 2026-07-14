import { describe, expect, it, vi } from 'vitest';
import {
  IntlUsdPriceProvider,
  PriceResolver,
  PtaxClient,
  checkPriceSanity,
  formatPtaxDate,
  mapUsdPrices,
  parsePtaxVenda,
  usdCentsToBrlCents,
  usdToCents,
} from '../../src/integrations/pricing/index.js';
import type {
  InternationalPriceSource,
  PriceProvider,
  PriceQuote,
} from '../../src/integrations/pricing/types.js';
import { selectCurrentPrice, serializePrice } from '../../src/modules/pricing/current.js';
import type { PriceLike } from '../../src/modules/pricing/current.js';

/**
 * Testes de dinheiro obrigatórios da US3 (T039, constituição I): sanidade de cotação,
 * conversão PTAX, seleção de fonte/fallback e seleção da cotação vigente por item.
 */

describe('checkPriceSanity', () => {
  it('aceita a primeira cotação (sem baseline)', () => {
    expect(checkPriceSanity(null, 1000, 5).ok).toBe(true);
    expect(checkPriceSanity(0, 1000, 5).ok).toBe(true);
  });

  it('rejeita valores não positivos ou não inteiros', () => {
    expect(checkPriceSanity(1000, 0, 5).ok).toBe(false);
    expect(checkPriceSanity(1000, -5, 5).ok).toBe(false);
    expect(checkPriceSanity(1000, 12.5, 5).ok).toBe(false);
  });

  it('aceita variação dentro do fator e rejeita fora dele', () => {
    expect(checkPriceSanity(1000, 4000, 5).ok).toBe(true); // 4× ≤ 5×
    expect(checkPriceSanity(1000, 6000, 5).ok).toBe(false); // 6× > 5×
    expect(checkPriceSanity(6000, 1000, 5).ok).toBe(false); // queda 6× também é suspeita
  });
});

describe('conversão USD → BRL (centavos inteiros)', () => {
  it('usdToCents arredonda ao centavo', () => {
    expect(usdToCents(1.5)).toBe(150);
    expect(usdToCents(9.999)).toBe(1000);
  });

  it('usdCentsToBrlCents aplica o câmbio e arredonda', () => {
    expect(usdCentsToBrlCents(150, 5)).toBe(750);
    expect(usdCentsToBrlCents(199, 5.25)).toBe(1045); // round(1044.75)
  });

  it('mapUsdPrices extrai preços por variante (market → mid → low)', () => {
    const payload = {
      data: {
        tcgplayer: {
          prices: {
            normal: { market: 1.5 },
            holofoil: { market: 10, mid: 9 },
            reverseHolofoil: { low: 2 },
            unknownKey: { market: 99 },
          },
        },
      },
    };
    const prices = mapUsdPrices(payload);
    expect(prices).toEqual(
      expect.arrayContaining([
        { variant: 'normal', priceUsdCents: 150 },
        { variant: 'holo', priceUsdCents: 1000 },
        { variant: 'reverse_foil', priceUsdCents: 200 },
      ]),
    );
    expect(prices).toHaveLength(3); // chave desconhecida ignorada
  });

  it('mapUsdPrices retorna vazio sem bloco de preço', () => {
    expect(mapUsdPrices({ data: {} })).toEqual([]);
    expect(mapUsdPrices(null)).toEqual([]);
  });
});

describe('PtaxClient', () => {
  it('formata a data em MM-DD-YYYY (UTC)', () => {
    expect(formatPtaxDate(new Date('2026-07-14T00:00:00Z'))).toBe('07-14-2026');
  });

  it('parsePtaxVenda extrai cotacaoVenda ou null', () => {
    expect(parsePtaxVenda({ value: [{ cotacaoVenda: 5.43 }] })).toBe(5.43);
    expect(parsePtaxVenda({ value: [] })).toBeNull();
    expect(parsePtaxVenda({})).toBeNull();
  });

  it('faz walk-back quando não há pregão na data', async () => {
    // 1ª chamada (hoje) vazia; 2ª (ontem) com cotação.
    const http = vi
      .fn()
      .mockResolvedValueOnce({ value: [] })
      .mockResolvedValueOnce({ value: [{ cotacaoVenda: 5.4 }] });
    const ptax = new PtaxClient(http, { baseUrl: 'https://ptax.test', maxLookbackDays: 3 });
    const rate = await ptax.usdToBrl(new Date('2026-07-14T00:00:00Z'));
    expect(rate).toBe(5.4);
    expect(http).toHaveBeenCalledTimes(2);
  });

  it('cacheia por dia (não refaz a chamada)', async () => {
    const http = vi.fn().mockResolvedValue({ value: [{ cotacaoVenda: 5.1 }] });
    const ptax = new PtaxClient(http, { baseUrl: 'https://ptax.test' });
    const day = new Date('2026-07-14T00:00:00Z');
    await ptax.usdToBrl(day);
    await ptax.usdToBrl(day);
    expect(http).toHaveBeenCalledTimes(1);
  });
});

describe('IntlUsdPriceProvider', () => {
  it('converte preços USD da fonte em cotações BRL com fonte/fx', async () => {
    const usd: InternationalPriceSource = {
      usdPricesFor: vi.fn().mockResolvedValue([{ variant: 'normal', priceUsdCents: 150 }]),
    };
    const fx = { usdToBrl: vi.fn().mockResolvedValue(5) };
    const provider = new IntlUsdPriceProvider(usd, fx);
    const quotes = await provider.quotesFor({ cardId: 'c1', externalId: 'swsh3-1' });
    expect(quotes).toEqual([
      expect.objectContaining({
        variant: 'normal',
        condition: null,
        priceCents: 750,
        source: 'intl_usd_fx',
        fxRate: 5,
      }),
    ]);
  });
});

describe('PriceResolver — fallback por carta', () => {
  const ref = { cardId: 'c1', externalId: 'swsh3-1' };
  const quote = (source: PriceQuote['source']): PriceQuote => ({
    variant: 'normal',
    condition: null,
    priceCents: 1000,
    source,
    fxRate: null,
    fetchedAt: new Date(),
  });

  it('usa a primária quando ela retorna preço (não chama o fallback)', async () => {
    const primary: PriceProvider = {
      source: 'liga_pokemon',
      enabled: true,
      quotesFor: vi.fn().mockResolvedValue([quote('liga_pokemon')]),
    };
    const fallback: PriceProvider = {
      source: 'intl_usd_fx',
      enabled: true,
      quotesFor: vi.fn().mockResolvedValue([quote('intl_usd_fx')]),
    };
    const resolver = new PriceResolver([primary, fallback]);
    const out = await resolver.resolve(ref);
    expect(out[0]?.source).toBe('liga_pokemon');
    expect(fallback.quotesFor).not.toHaveBeenCalled();
  });

  it('cai para o fallback quando a primária falha', async () => {
    const primary: PriceProvider = {
      source: 'liga_pokemon',
      enabled: true,
      quotesFor: vi.fn().mockRejectedValue(new Error('HTML mudou')),
    };
    const fallback: PriceProvider = {
      source: 'intl_usd_fx',
      enabled: true,
      quotesFor: vi.fn().mockResolvedValue([quote('intl_usd_fx')]),
    };
    const resolver = new PriceResolver([primary, fallback]);
    const out = await resolver.resolve(ref);
    expect(out[0]?.source).toBe('intl_usd_fx');
  });

  it('cai para o fallback quando a primária não tem preço para a carta', async () => {
    const primary: PriceProvider = {
      source: 'liga_pokemon',
      enabled: true,
      quotesFor: vi.fn().mockResolvedValue([]),
    };
    const fallback: PriceProvider = {
      source: 'intl_usd_fx',
      enabled: true,
      quotesFor: vi.fn().mockResolvedValue([quote('intl_usd_fx')]),
    };
    const resolver = new PriceResolver([primary, fallback]);
    expect((await resolver.resolve(ref))[0]?.source).toBe('intl_usd_fx');
  });

  it('retorna vazio quando nenhuma fonte tem preço', async () => {
    const only: PriceProvider = {
      source: 'intl_usd_fx',
      enabled: true,
      quotesFor: vi.fn().mockResolvedValue([]),
    };
    expect(await new PriceResolver([only]).resolve(ref)).toEqual([]);
  });
});

describe('selectCurrentPrice / serializePrice', () => {
  const at = new Date('2026-07-14T00:00:00Z');
  const price = (over: Partial<PriceLike>): PriceLike => ({
    condition: null,
    variant: 'normal',
    priceCents: 1000,
    source: 'intl_usd_fx',
    fxRate: null,
    fetchedAt: at,
    ...over,
  });

  it('prefere a fonte primária BR sobre o fallback internacional', () => {
    const prices = [
      price({ source: 'intl_usd_fx', priceCents: 1000, condition: null }),
      price({ source: 'liga_pokemon', priceCents: 900, condition: 'near_mint' }),
    ];
    const chosen = selectCurrentPrice(prices, { condition: 'near_mint', variant: 'normal' });
    expect(chosen?.source).toBe('liga_pokemon');
  });

  it('casa condição específica; cai para cotação sem condição', () => {
    const intlNoCond = price({ source: 'intl_usd_fx', condition: null });
    const chosen = selectCurrentPrice([intlNoCond], { condition: 'played', variant: 'normal' });
    expect(chosen).toBe(intlNoCond);
  });

  it('não casa variante diferente', () => {
    const holo = price({ variant: 'holo' });
    expect(selectCurrentPrice([holo], { condition: 'mint', variant: 'normal' })).toBeNull();
  });

  it('serializePrice converte fx para número e mapeia campos', () => {
    expect(serializePrice(price({ source: 'liga_pokemon', priceCents: 1234 }))).toEqual({
      price_cents: 1234,
      source: 'liga_pokemon',
      fetched_at: at,
      fx_rate: null,
    });
    expect(serializePrice(null)).toBeNull();
  });
});
