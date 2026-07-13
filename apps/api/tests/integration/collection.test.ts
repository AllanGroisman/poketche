import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { loadConfig } from '../../src/lib/config.js';
import type { AuthUser } from '../../src/modules/auth/plugin.js';

/**
 * Teste de integração da US2 (T033): busca multilíngue + adicionar/merge/editar/remover.
 * Semeia um catálogo de fixtures no banco de teste efêmero.
 */

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'postgresql://poketche:poketche@localhost:5435/poketche_test';

const userId = randomUUID();
const setExternalId = `test-set-${userId.slice(0, 8)}`;

let prisma: PrismaClient;
let app: FastifyInstance;
let charizardId: string;
let bulbasaurId: string;

const auth = { 'x-test-user-id': userId, 'x-test-email': 'colecionador@example.com' };

function img(n: string) {
  return { imageSmallUrl: `https://src/${n}/low.png`, imageLargeUrl: `https://src/${n}/high.png` };
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

  const set = await prisma.cardSet.create({
    data: { externalId: setExternalId, name: 'Test Set', series: 'Test', totalCards: 2 },
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
        create: [
          { language: 'en', name: 'Charizard', source: 'pokemontcgio', ...img('c-en') },
          { language: 'pt', name: 'Charizard', source: 'tcgdex', ...img('c-pt') },
        ],
      },
    },
  });
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
        create: [
          { language: 'en', name: 'Bulbasaur', source: 'pokemontcgio', ...img('b-en') },
          { language: 'pt', name: 'Bulbasauro', source: 'tcgdex', ...img('b-pt') },
        ],
      },
    },
  });
  charizardId = charizard.id;
  bulbasaurId = bulbasaur.id;
});

afterAll(async () => {
  await app.close();
  await prisma.collectionItem.deleteMany({ where: { userId } });
  await prisma.userProfile.deleteMany({ where: { id: userId } });
  await prisma.card.deleteMany({ where: { set: { externalId: setExternalId } } });
  await prisma.cardSet.deleteMany({ where: { externalId: setExternalId } });
  await prisma.$disconnect();
});

describe('US2 — registro manual da coleção', () => {
  it('busca por substring encontra a carta (autocomplete)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/catalog/cards?q=chari&lang=pt' });
    expect(res.statusCode).toBe(200);
    const { results } = res.json();
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].id).toBe(charizardId);
    expect(results[0].language).toBe('pt');
    expect(results[0].image_small_url).toContain('/catalog/images/');
  });

  it('busca acha pelo nome em português (multilíngue)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/catalog/cards?q=Bulbasauro&lang=pt',
    });
    const { results } = res.json();
    expect(results.some((r: { id: string }) => r.id === bulbasaurId)).toBe(true);
  });

  it('adiciona item à coleção', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/collection/items',
      headers: auth,
      payload: {
        card_id: charizardId,
        condition: 'near_mint',
        language: 'pt',
        quantity: 2,
        acquisition_price_cents: 5000,
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.item.quantity).toBe(2);
    expect(body.item.card.name).toBe('Charizard');
    expect(body.wishlist_matches).toEqual([]);
  });

  it('adicionar a mesma combinação faz merge (soma quantidade)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/collection/items',
      headers: auth,
      payload: { card_id: charizardId, condition: 'near_mint', language: 'pt', quantity: 3 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().item.quantity).toBe(5); // 2 + 3
  });

  it('variante diferente é item distinto', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/collection/items',
      headers: auth,
      payload: {
        card_id: charizardId,
        condition: 'near_mint',
        language: 'pt',
        variant: 'reverse_foil',
        quantity: 1,
      },
    });
    expect(res.statusCode).toBe(200);
    const list = await app.inject({ method: 'GET', url: '/api/v1/collection', headers: auth });
    expect(list.json().items).toHaveLength(2);
  });

  it('rejeita preço de aquisição <= 0', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/collection/items',
      headers: auth,
      payload: {
        card_id: bulbasaurId,
        condition: 'mint',
        language: 'en',
        quantity: 1,
        acquisition_price_cents: 0,
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('edita a quantidade de um item', async () => {
    const list = await app.inject({ method: 'GET', url: '/api/v1/collection', headers: auth });
    const target = list.json().items.find((i: { variant: string }) => i.variant === 'normal') as {
      id: string;
    };
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/collection/items/${target.id}`,
      headers: auth,
      payload: { quantity: 4 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().item.quantity).toBe(4);
  });

  it('remove um item', async () => {
    const list = await app.inject({ method: 'GET', url: '/api/v1/collection', headers: auth });
    const target = list.json().items[0] as { id: string };
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/collection/items/${target.id}`,
      headers: auth,
    });
    expect(res.statusCode).toBe(200);
    const after = await app.inject({ method: 'GET', url: '/api/v1/collection', headers: auth });
    expect(after.json().items).toHaveLength(1);
  });

  it('não deixa mexer em item de outro usuário (404)', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/collection/items/${randomUUID()}`,
      headers: auth,
    });
    expect(res.statusCode).toBe(404);
  });
});
