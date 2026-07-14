import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPriceResolver } from '../../src/integrations/pricing/resolver.js';
import type { HttpJson } from '../../src/integrations/catalog/http.js';
import { runPriceRefresh } from '../../src/jobs/price-refresh.js';
import { runPriceSnapshot } from '../../src/jobs/price-snapshot.js';

/**
 * Teste de integração da US3 (T041): com a fonte primária fora (por flag ou indisponível),
 * o ciclo de cotação completa via fallback internacional e a última cotação é preservada
 * quando a nova é suspeita. Usa o banco de teste efêmero (:5435).
 */

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'postgresql://poketche:poketche@localhost:5435/poketche_test';

const setExternalId = `price-set-${randomUUID().slice(0, 8)}`;
const cardExternalId = `${setExternalId}-1`;

let prisma: PrismaClient;
let cardId: string;

const RESOLVER_BASE = {
  INTL_PRICE_BASE_URL: 'https://intl.test',
  PTAX_BASE_URL: 'https://ptax.test',
};

/** HTTP simulado roteado por URL: PTAX, Liga e a fonte internacional (pokemontcg.io). */
function makeHttp(usdMarket: number, opts: { ligaFails?: boolean } = {}): HttpJson {
  return async (url: string) => {
    if (url.includes('ptax.test')) return { value: [{ cotacaoVenda: 5 }] };
    if (url.includes('liga.test')) {
      if (opts.ligaFails) throw new Error('liga indisponível');
      return { offers: [] };
    }
    if (url.includes('/cards/')) {
      return { data: { tcgplayer: { prices: { normal: { market: usdMarket } } } } };
    }
    throw new Error(`URL inesperada: ${url}`);
  };
}

beforeAll(async () => {
  prisma = new PrismaClient({ datasourceUrl: TEST_URL });
  const set = await prisma.cardSet.create({
    data: { externalId: setExternalId, name: 'Price Set', series: 'Test', totalCards: 1 },
  });
  const card = await prisma.card.create({
    data: {
      externalId: cardExternalId,
      setId: set.id,
      number: '1',
      rarity: 'Rare',
      supertype: 'Pokémon',
      subtypes: [],
      types: ['Fire'],
    },
  });
  cardId = card.id;
});

afterAll(async () => {
  await prisma.cardPriceSnapshot.deleteMany({ where: { cardId } });
  await prisma.cardPrice.deleteMany({ where: { cardId } });
  await prisma.card.deleteMany({ where: { set: { externalId: setExternalId } } });
  await prisma.cardSet.deleteMany({ where: { externalId: setExternalId } });
  await prisma.$disconnect();
});

describe('US3 — precificação com resiliência de fontes', () => {
  it('com a Liga desligada por flag, publica a cotação internacional (USD+PTAX)', async () => {
    const resolver = createPriceResolver(
      { ...RESOLVER_BASE, PRICING_LIGA_ENABLED: false },
      makeHttp(2), // 2 USD → 200¢ USD × 5 = 1000¢ BRL
    );
    const result = await runPriceRefresh(
      { prisma, resolver, sanityMaxFactor: 5 },
      { cardIds: [cardId] },
    );
    expect(result.quotesPublished).toBe(1);

    const price = await prisma.cardPrice.findFirst({ where: { cardId } });
    expect(price?.source).toBe('intl_usd_fx');
    expect(price?.priceCents).toBe(1000);
    expect(price?.condition).toBeNull();
    expect(price?.variant).toBe('normal');
    expect(Number(price?.fxRate)).toBe(5);
  });

  it('preserva a última cotação quando a nova é suspeita (sanidade)', async () => {
    const resolver = createPriceResolver(
      { ...RESOLVER_BASE, PRICING_LIGA_ENABLED: false },
      makeHttp(100), // 100 USD → 50000¢ BRL = 50× o anterior (1000) → suspeito
    );
    const result = await runPriceRefresh(
      { prisma, resolver, sanityMaxFactor: 5 },
      { cardIds: [cardId] },
    );
    expect(result.suspicious).toBe(1);
    expect(result.quotesPublished).toBe(0);

    const price = await prisma.cardPrice.findFirst({ where: { cardId } });
    expect(price?.priceCents).toBe(1000); // última cotação preservada
  });

  it('com a Liga ligada mas indisponível, o ciclo completa via fallback', async () => {
    const resolver = createPriceResolver(
      { ...RESOLVER_BASE, PRICING_LIGA_ENABLED: true, LIGA_BASE_URL: 'https://liga.test' },
      makeHttp(2, { ligaFails: true }),
    );
    expect(resolver.sources).toEqual(['liga_pokemon', 'intl_usd_fx']);
    const result = await runPriceRefresh(
      { prisma, resolver, sanityMaxFactor: 5 },
      { cardIds: [cardId] },
    );
    expect(result.cardsWithoutPrice).toBe(0);

    const price = await prisma.cardPrice.findFirst({ where: { cardId } });
    expect(price?.source).toBe('intl_usd_fx'); // fallback assumiu
  });

  it('price-snapshot grava o histórico append-only da cotação vigente', async () => {
    const before = await prisma.cardPriceSnapshot.count({ where: { cardId } });
    const { snapshots } = await runPriceSnapshot(
      { prisma },
      { since: new Date(Date.now() - 60_000) },
    );
    expect(snapshots).toBeGreaterThanOrEqual(1);
    const after = await prisma.cardPriceSnapshot.count({ where: { cardId } });
    expect(after).toBeGreaterThan(before);
  });
});
