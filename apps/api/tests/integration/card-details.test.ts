import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { loadConfig } from '../../src/lib/config.js';
import type { AuthUser } from '../../src/modules/auth/plugin.js';

/**
 * Teste de integração da US8 (T042/T043): detalhes do item (variações/ganho/perda/gráfico) e
 * histórico público da carta a partir dos snapshots. Cobre também o caso de histórico
 * insuficiente (< 2 snapshots → "histórico indisponível"). Banco de teste efêmero (:5435).
 */

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'postgresql://poketche:poketche@localhost:5435/poketche_test';

const userId = randomUUID();
const setExternalId = `details-set-${userId.slice(0, 8)}`;
const auth = { 'x-test-user-id': userId };

let prisma: PrismaClient;
let app: FastifyInstance;
let pricedCardId: string;
let pricedItemId: string;
let sparseCardId: string;
let sparseItemId: string;

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

async function makeCard(number: string, name: string): Promise<string> {
  const card = await prisma.card.create({
    data: {
      externalId: `${setExternalId}-${number}`,
      setId: (await prisma.cardSet.findFirstOrThrow({ where: { externalId: setExternalId } })).id,
      number,
      rarity: 'Rare',
      supertype: 'Pokémon',
      subtypes: [],
      types: ['Fire'],
      translations: {
        create: [
          {
            language: 'en',
            name,
            source: 'pokemontcgio',
            imageSmallUrl: `https://src/${number}/low.png`,
            imageLargeUrl: `https://src/${number}/high.png`,
          },
        ],
      },
    },
  });
  return card.id;
}

beforeAll(async () => {
  prisma = new PrismaClient({ datasourceUrl: TEST_URL });
  const config = loadConfig({ DATABASE_URL: TEST_URL, NODE_ENV: 'test' });
  app = await buildApp(config, {
    prismaClient: prisma,
    authOverride: (req): AuthUser => ({
      id: req.headers['x-test-user-id'] as string,
      role: 'user',
      email: 'colecionador@example.com',
    }),
  });
  await app.ready();

  await prisma.cardSet.create({
    data: { externalId: setExternalId, name: 'Details Set', series: 'Test', totalCards: 2 },
  });
  await prisma.userProfile.create({ data: { id: userId, displayName: 'Colecionador' } });

  pricedCardId = await makeCard('1', 'Charizard');
  sparseCardId = await makeCard('2', 'Bulbasaur');

  // Item com preço de aquisição e histórico de 3 pontos (variante normal, sem condição na fonte).
  const item = await prisma.collectionItem.create({
    data: {
      userId,
      cardId: pricedCardId,
      condition: 'near_mint',
      language: 'en',
      variant: 'normal',
      quantity: 3,
      acquisitionPriceCents: 600,
    },
  });
  pricedItemId = item.id;

  await prisma.cardPrice.create({
    data: {
      cardId: pricedCardId,
      condition: null,
      variant: 'normal',
      priceCents: 1000,
      source: 'intl_usd_fx',
      fxRate: '5.0',
      fetchedAt: daysAgo(1),
    },
  });
  await prisma.cardPriceSnapshot.createMany({
    data: [40, 10, 1].map((d, i) => ({
      cardId: pricedCardId,
      condition: null,
      variant: 'normal' as const,
      priceCents: [800, 900, 1000][i]!,
      source: 'intl_usd_fx' as const,
      fetchedAt: daysAgo(d),
    })),
  });

  // Item com histórico insuficiente (1 snapshot apenas).
  const sparse = await prisma.collectionItem.create({
    data: {
      userId,
      cardId: sparseCardId,
      condition: 'near_mint',
      language: 'en',
      variant: 'normal',
      quantity: 1,
    },
  });
  sparseItemId = sparse.id;
  await prisma.cardPrice.create({
    data: {
      cardId: sparseCardId,
      condition: null,
      variant: 'normal',
      priceCents: 500,
      source: 'intl_usd_fx',
      fetchedAt: daysAgo(1),
    },
  });
  await prisma.cardPriceSnapshot.create({
    data: {
      cardId: sparseCardId,
      condition: null,
      variant: 'normal',
      priceCents: 500,
      source: 'intl_usd_fx',
      fetchedAt: daysAgo(1),
    },
  });
});

afterAll(async () => {
  await app.close();
  await prisma.cardPriceSnapshot.deleteMany({
    where: { card: { set: { externalId: setExternalId } } },
  });
  await prisma.cardPrice.deleteMany({ where: { card: { set: { externalId: setExternalId } } } });
  await prisma.collectionItem.deleteMany({ where: { userId } });
  await prisma.userProfile.deleteMany({ where: { id: userId } });
  await prisma.card.deleteMany({ where: { set: { externalId: setExternalId } } });
  await prisma.cardSet.deleteMany({ where: { externalId: setExternalId } });
  await prisma.$disconnect();
});

describe('US8 — detalhes do item', () => {
  it('retorna variações, ganho/perda vs. aquisição, maior/menor e a série do gráfico', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/collection/items/${pricedItemId}/details`,
      headers: auth,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();

    expect(body.current_price.price_cents).toBe(1000);
    expect(body.position_value_cents).toBe(3000); // 1000 × 3
    expect(body.history_available).toBe(true);
    expect(body.snapshot_count).toBe(3);

    // 7d: referência = ponto de 10d (900); 30d: ponto de 40d (800); 90d: sem referência.
    expect(body.variations['7d']).toMatchObject({ from_cents: 900, change_cents: 100 });
    expect(body.variations['30d']).toMatchObject({ from_cents: 800, change_cents: 200 });
    expect(body.variations['90d']).toBeNull();

    expect(body.gain_loss).toMatchObject({
      basis: 'acquisition',
      from_cents: 600,
      to_cents: 1000,
      change_cents: 400,
    });
    expect(body.high_low).toEqual({ high_cents: 1000, low_cents: 800 });
    expect(body.history).toHaveLength(3);
  });

  it('sinaliza histórico indisponível com < 2 snapshots (sem gráfico, variações nulas)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/collection/items/${sparseItemId}/details`,
      headers: auth,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.history_available).toBe(false);
    expect(body.snapshot_count).toBe(1);
    expect(body.variations['7d']).toBeNull();
    expect(body.variations['30d']).toBeNull();
  });

  it('404 para item de outro usuário', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/collection/items/${pricedItemId}/details`,
      headers: { 'x-test-user-id': randomUUID() },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('US8 — histórico público da carta', () => {
  it('serve a série de snapshots sem autenticação, com change do período', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/catalog/cards/${pricedCardId}/price-history?period=all`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.variant).toBe('normal');
    expect(body.history_available).toBe(true);
    expect(body.points).toHaveLength(3);
    expect(body.high_low).toEqual({ high_cents: 1000, low_cents: 800 });
    expect(body.change).toMatchObject({ from_cents: 800, to_cents: 1000, change_cents: 200 });
    expect(res.headers['cache-control']).toContain('max-age');
  });

  it('recorta ao período pedido (7d) sem interpolar fora da janela', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/catalog/cards/${pricedCardId}/price-history?period=7d`,
    });
    const body = res.json();
    expect(body.points).toHaveLength(1); // só o ponto de 1d atrás cai na janela de 7d
    expect(body.change).toMatchObject({ from_cents: 900 }); // referência ≤ corte de 7d
  });
});
