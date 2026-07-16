import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { loadConfig } from '../../src/lib/config.js';

/**
 * Teste de integração da US7 (T053): matriz de visibilidade + revogação (FR-003a/b/c, SC-012).
 * Todas as requisições são feitas **sem headers de auth** — é a visão do visitante.
 */

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'postgresql://poketche:poketche@localhost:5435/poketche_test';

const userId = randomUUID();
const uniq = userId.slice(0, 8);
const setExternalId = `pub-set-${uniq}`;
const shareToken = `share-${userId}`;

// Nomes exclusivos deste teste: a busca do catálogo ranqueia por similaridade sobre TODAS as
// traduções do banco, e as suítes rodam em paralelo — reusar "Charizard" quebraria a US2.
const RARE_NAME = `Publizard ${uniq}`;
const COMMON_NAME = `Publissauro ${uniq}`;

let prisma: PrismaClient;
let app: FastifyInstance;

function img(n: string) {
  return { imageSmallUrl: `https://src/${n}/low.png`, imageLargeUrl: `https://src/${n}/high.png` };
}

/** Ajusta os flags do dono e busca a visão pública — o par que a matriz exercita. */
async function viewWith(flags: {
  showCards?: boolean;
  showValues?: boolean;
  showQuantities?: boolean;
}) {
  await prisma.collectionVisibility.update({ where: { userId }, data: flags });
  const res = await app.inject({ method: 'GET', url: `/api/v1/public/collections/${shareToken}` });
  expect(res.statusCode).toBe(200);
  return res.json();
}

beforeAll(async () => {
  prisma = new PrismaClient({ datasourceUrl: TEST_URL });
  const config = loadConfig({ DATABASE_URL: TEST_URL, NODE_ENV: 'test' });
  app = await buildApp(config, { prismaClient: prisma });
  await app.ready();

  await prisma.userProfile.create({ data: { id: userId, displayName: 'Ash Ketchum' } });
  await prisma.collectionVisibility.create({
    data: { userId, status: 'public_link', shareToken },
  });

  const set = await prisma.cardSet.create({
    data: { externalId: setExternalId, name: 'Public Set', series: 'Test', totalCards: 2 },
  });
  const charizard = await prisma.card.create({
    data: {
      externalId: `${setExternalId}-1`,
      setId: set.id,
      number: '1',
      rarity: 'Rare',
      supertype: 'Pokémon',
      subtypes: [],
      types: ['Fire'],
      translations: {
        create: [{ language: 'pt', name: RARE_NAME, source: 'tcgdex', ...img('c-pt') }],
      },
    },
  });
  // Segunda carta sem cotação: garante que `unpriced_items` seja exercitado de verdade.
  const bulbasaur = await prisma.card.create({
    data: {
      externalId: `${setExternalId}-2`,
      setId: set.id,
      number: '2',
      rarity: 'Common',
      supertype: 'Pokémon',
      subtypes: [],
      types: ['Grass'],
      translations: {
        create: [{ language: 'pt', name: COMMON_NAME, source: 'tcgdex', ...img('b-pt') }],
      },
    },
  });

  await prisma.cardPrice.create({
    data: {
      cardId: charizard.id,
      condition: null,
      variant: 'normal',
      priceCents: 10_000,
      source: 'intl_usd_fx',
      fxRate: '5.4321',
    },
  });

  await prisma.collectionItem.createMany({
    data: [
      {
        userId,
        cardId: charizard.id,
        condition: 'near_mint',
        language: 'pt',
        variant: 'normal',
        quantity: 3,
        acquisitionPriceCents: 5_000,
      },
      {
        userId,
        cardId: bulbasaur.id,
        condition: 'good',
        language: 'pt',
        variant: 'normal',
        quantity: 1,
      },
    ],
  });
});

afterAll(async () => {
  await app.close();
  await prisma.collectionItem.deleteMany({ where: { userId } });
  await prisma.userProfile.deleteMany({ where: { id: userId } });
  await prisma.card.deleteMany({ where: { set: { externalId: setExternalId } } });
  await prisma.cardSet.deleteMany({ where: { externalId: setExternalId } });
  await prisma.$disconnect();
});

describe('US7 — visão pública da coleção', () => {
  it('visitante sem sessão abre o link e vê cartas com imagem (cenário 1, SC-012)', async () => {
    const body = await viewWith({ showCards: true, showValues: false, showQuantities: false });
    expect(body.owner.display_name).toBe('Ash Ketchum');
    expect(body.items).toHaveLength(2);
    expect(body.items[0].card.image_small_url).toContain('/catalog/images/');
    // Estatísticas básicas independem dos valores (FR-003b).
    expect(body.stats).toMatchObject({ distinct_cards: 2, sets: 1 });
  });

  it('sem autorização de valores, nenhum valor aparece — nem total (cenário 2)', async () => {
    const body = await viewWith({ showCards: true, showValues: false, showQuantities: true });
    expect(body.summary).toBeNull();
    for (const item of body.items) {
      expect(item.price).toBeNull();
      expect(item.position_value_cents).toBeNull();
    }
  });

  it('com valores autorizados, exibe total, preço e itens sem cotação (cenário 3, FR-016)', async () => {
    const body = await viewWith({ showCards: true, showValues: true, showQuantities: true });
    // 3 × R$ 100,00 da carta cotada; a sem cotação fica fora do total, com indicação.
    expect(body.summary).toEqual({ total_cents: 30_000, priced_items: 1, unpriced_items: 1 });
    const priced = body.items.find((i: { card: { number: string } }) => i.card.number === '1');
    expect(priced.price).toMatchObject({ price_cents: 10_000, source: 'intl_usd_fx' });
    expect(priced.price.fetched_at).toBeTruthy();
    expect(priced.position_value_cents).toBe(30_000);
    const unpriced = body.items.find((i: { card: { number: string } }) => i.card.number === '2');
    expect(unpriced.price).toBeNull();
    expect(unpriced.position_value_cents).toBeNull();
  });

  it('com quantidades ocultas, não indica quantas cópias o dono possui (cenário 4)', async () => {
    const body = await viewWith({ showCards: true, showValues: true, showQuantities: false });
    expect(body.stats.total_cards).toBeNull();
    for (const item of body.items) {
      expect(item.quantity).toBeNull();
      // O valor da posição revelaria a quantidade (valor ÷ preço unitário).
      expect(item.position_value_cents).toBeNull();
    }
    // O total agregado continua permitido — não revela a quantidade de nenhuma carta.
    expect(body.summary.total_cents).toBe(30_000);
  });

  it('com a lista de cartas oculta, restam apenas as estatísticas', async () => {
    const body = await viewWith({ showCards: false, showValues: true, showQuantities: true });
    expect(body.items).toEqual([]);
    expect(body.stats).toMatchObject({ distinct_cards: 2, sets: 1, total_cards: 4 });
    expect(body.summary.total_cents).toBe(30_000);
  });

  it('nunca expõe o preço de aquisição do dono nem o id do item', async () => {
    const body = await viewWith({ showCards: true, showValues: true, showQuantities: true });
    for (const item of body.items) {
      expect(item).not.toHaveProperty('acquisition_price_cents');
      expect(item).not.toHaveProperty('id');
    }
  });

  it('não é cacheável — mudança de visibilidade vale imediatamente (FR-003a)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/public/collections/${shareToken}`,
    });
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('coleção que voltou a ser privada dá 404 opaco, sem revelar conteúdo (cenário 5)', async () => {
    await prisma.collectionVisibility.update({
      where: { userId },
      data: { status: 'private', shareToken: null },
    });
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/public/collections/${shareToken}`,
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('not_found');
  });

  it('token inexistente responde igual ao revogado (indistinguíveis, FR-003c)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/public/collections/token-que-nunca-existiu',
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('not_found');
  });
});
