import { describe, expect, it, vi } from 'vitest';
import {
  LigaParseError,
  LigaPriceCollector,
  parseBrlToCents,
  parseLigaOffers,
} from '../../src/integrations/pricing/liga/collector.js';
import { createPriceResolver } from '../../src/integrations/pricing/resolver.js';

/**
 * Testes de contrato do `LigaPriceCollector` (T037): parser resiliente sobre fixtures da
 * página, sanidade básica de valores, e comportamento de flag/fallback. O coletor fica
 * pronto no código mas DESLIGADO até o parecer legal (T034).
 */

// Fixture representando as ofertas extraídas de uma página de card na Liga.
const LIGA_PAGE = {
  offers: [
    { price: 'R$ 12,50', foil: false },
    { price: 'R$ 10,00', foil: false }, // menor oferta normal
    { price: 'R$ 45,90', foil: true },
    { price: 'esgotado', foil: false }, // ilegível → ignorada
  ],
};

describe('parseBrlToCents', () => {
  it('converte formatos BRL para centavos inteiros', () => {
    expect(parseBrlToCents('R$ 12,50')).toBe(1250);
    expect(parseBrlToCents('R$ 1.234,56')).toBe(123456);
    expect(parseBrlToCents('10,00')).toBe(1000);
    expect(parseBrlToCents('R$ 12')).toBe(1200);
  });

  it('retorna null para valores inválidos', () => {
    expect(parseBrlToCents('esgotado')).toBeNull();
    expect(parseBrlToCents('R$ 0,00')).toBeNull();
    expect(parseBrlToCents('')).toBeNull();
  });
});

describe('parseLigaOffers', () => {
  it('extrai a menor oferta por variante', () => {
    const out = parseLigaOffers(LIGA_PAGE);
    expect(out).toEqual(
      expect.arrayContaining([
        { variant: 'normal', priceBrlCents: 1000 },
        { variant: 'holo', priceBrlCents: 4590 },
      ]),
    );
    expect(out).toHaveLength(2);
  });

  it('lança LigaParseError quando a estrutura muda (dispara fallback no job)', () => {
    expect(() => parseLigaOffers({ items: [] })).toThrow(LigaParseError);
    expect(() => parseLigaOffers(null)).toThrow(LigaParseError);
  });
});

describe('LigaPriceCollector', () => {
  it('quando habilitado, busca e mapeia cotações em BRL (fxRate null)', async () => {
    const http = vi.fn().mockResolvedValue(LIGA_PAGE);
    const collector = new LigaPriceCollector(http, {
      enabled: true,
      baseUrl: 'https://liga.test',
    });
    const quotes = await collector.quotesFor({ cardId: 'c1', externalId: 'swsh3-1' });
    expect(collector.source).toBe('liga_pokemon');
    expect(quotes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          variant: 'normal',
          priceCents: 1000,
          source: 'liga_pokemon',
          fxRate: null,
        }),
      ]),
    );
  });

  it('sem LIGA_BASE_URL, falha de forma controlada (parse error → fallback)', async () => {
    const collector = new LigaPriceCollector(vi.fn(), { enabled: true });
    await expect(collector.quotesFor({ cardId: 'c1', externalId: 'x' })).rejects.toThrow(
      LigaParseError,
    );
  });
});

describe('createPriceResolver — flag da Liga', () => {
  const base = {
    INTL_PRICE_BASE_URL: 'https://intl.test',
    PTAX_BASE_URL: 'https://ptax.test',
  };

  it('com a flag DESLIGADA, o resolver opera só com a fonte internacional', () => {
    const resolver = createPriceResolver({ ...base, PRICING_LIGA_ENABLED: false }, vi.fn());
    expect(resolver.sources).toEqual(['intl_usd_fx']);
  });

  it('com a flag LIGADA, a Liga entra como primária antes do fallback', () => {
    const resolver = createPriceResolver(
      { ...base, PRICING_LIGA_ENABLED: true, LIGA_BASE_URL: 'https://liga.test' },
      vi.fn(),
    );
    expect(resolver.sources).toEqual(['liga_pokemon', 'intl_usd_fx']);
  });
});
