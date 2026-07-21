import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { loadConfig } from '../../src/lib/config.js';
import type { AuthUser } from '../../src/modules/auth/plugin.js';

/**
 * Integração das coleções personalizadas (feature 002 — US1/US2/US3/US4): CRUD, vínculos M-N
 * idempotentes, recorte com valoração reusada da US4, hub, e as garantias de não-regressão
 * (inventário e dashboard geral intactos). Consolida T008/T015/T020/T024. Banco efêmero (:5435).
 */

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'postgresql://poketche:poketche@localhost:5435/poketche_test';

const userId = randomUUID();
const otherUserId = randomUUID();
const tok = userId.slice(0, 8);
const setExt = `cc-${tok}`;
const auth = { 'x-test-user-id': userId };
const otherAuth = { 'x-test-user-id': otherUserId };

let prisma: PrismaClient;
let app: FastifyInstance;
const cards: Record<string, string> = {};
const items: Record<string, string> = {};

async function makeCard(setId: string, number: string, name: string): Promise<string> {
  const card = await prisma.card.create({
    data: {
      externalId: `${setExt}-${number}`,
      setId,
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
            imageSmallUrl: `https://s/${setExt}-${number}/low.png`,
            imageLargeUrl: `https://s/${setExt}-${number}/high.png`,
          },
        ],
      },
    },
  });
  return card.id;
}

async function makeItem(cardId: string, quantity: number): Promise<string> {
  const item = await prisma.collectionItem.create({
    data: { userId, cardId, condition: 'near_mint', language: 'en', variant: 'normal', quantity },
  });
  return item.id;
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
    data: { externalId: setExt, name: `CC Set ${tok}`, series: 'Test', totalCards: 3 },
  });
  await prisma.userProfile.createMany({
    data: [
      { id: userId, displayName: 'Colecionador' },
      { id: otherUserId, displayName: 'Outro' },
    ],
  });

  cards.a = await makeCard(set.id, '1', `Aardmon-${tok}`); // preço 10.000
  cards.b = await makeCard(set.id, '2', `Beemon-${tok}`); // preço 5.000
  cards.c = await makeCard(set.id, '3', `Ceemon-${tok}`); // sem preço

  await prisma.cardPrice.createMany({
    data: [
      {
        cardId: cards.a,
        condition: null,
        variant: 'normal',
        priceCents: 10_000,
        source: 'intl_usd_fx',
      },
      {
        cardId: cards.b,
        condition: null,
        variant: 'normal',
        priceCents: 5_000,
        source: 'intl_usd_fx',
      },
    ],
  });

  items.a = await makeItem(cards.a, 2); // 2 × 10.000 = 20.000
  items.b = await makeItem(cards.b, 1); // 1 × 5.000 = 5.000
  items.c = await makeItem(cards.c, 3); // sem preço
});

afterAll(async () => {
  await app.close();
  await prisma.collection.deleteMany({ where: { userId: { in: [userId, otherUserId] } } });
  await prisma.collectionItem.deleteMany({ where: { userId: { in: [userId, otherUserId] } } });
  await prisma.cardPrice.deleteMany({ where: { card: { set: { externalId: setExt } } } });
  await prisma.userProfile.deleteMany({ where: { id: { in: [userId, otherUserId] } } });
  await prisma.card.deleteMany({ where: { set: { externalId: setExt } } });
  await prisma.cardSet.deleteMany({ where: { externalId: setExt } });
  await prisma.$disconnect();
});

const req = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: unknown) =>
  app.inject({ method, url: `/api/v1${url}`, headers: auth, ...(payload ? { payload } : {}) });

const createCollection = async (name: string): Promise<string> =>
  (await req('POST', '/collections', { name })).json().id as string;

describe('US1 — CRUD de coleções (FR-001..005)', () => {
  it('cria com resumo zerado, lista, renomeia e exclui', async () => {
    const create = await req('POST', '/collections', { name: '  Favoritas  ' });
    expect(create.statusCode).toBe(201);
    expect(create.json()).toMatchObject({
      name: 'Favoritas', // trim aplicado
      summary: { total_cents: 0, distinct_cards: 0, total_quantity: 0 },
      shared: false,
    });
    const id = create.json().id;

    const list = await req('GET', '/collections');
    expect(list.json().collections.some((c: { id: string }) => c.id === id)).toBe(true);

    const patch = await req('PATCH', `/collections/${id}`, { name: 'Top 10' });
    expect(patch.json()).toMatchObject({ name: 'Top 10' });

    expect((await req('DELETE', `/collections/${id}`)).statusCode).toBe(200);
    expect((await req('GET', `/collections/${id}`)).statusCode).toBe(404);
  });

  it('rejeita nome vazio/só espaços (FR-002)', async () => {
    expect((await req('POST', '/collections', { name: '   ' })).statusCode).toBe(400);
  });

  it('coleção de outro usuário responde 404 (não revela existência)', async () => {
    const id = await createCollection(`Privada ${tok}`);
    for (const m of ['GET', 'PATCH', 'DELETE'] as const) {
      const res = await app.inject({
        method: m,
        url: `/api/v1/collections/${id}`,
        headers: otherAuth,
        ...(m === 'PATCH' ? { payload: { name: 'x' } } : {}),
      });
      expect(res.statusCode).toBe(404);
    }
  });

  it('excluir coleção com cartas não altera o inventário completo (FR-004, SC-003)', async () => {
    const before = (await req('GET', '/collection')).json().summary;
    const id = await createCollection(`Com cartas ${tok}`);
    await req('POST', `/collections/${id}/items`, { collection_item_id: items.a });
    await req('DELETE', `/collections/${id}`);
    const after = (await req('GET', '/collection')).json().summary;
    expect(after).toEqual(before);
    // O item continua no inventário.
    expect(await prisma.collectionItem.findUnique({ where: { id: items.a } })).not.toBeNull();
  });
});

describe('US2 — vínculos M-N (FR-006..011)', () => {
  it('vincula a duas pastas, é idempotente, e o item conta 1× no inventário (SC-002)', async () => {
    const first = await createCollection(`Char ${tok}`);
    const second = await createCollection(`Fav ${tok}`);

    expect(
      (await req('POST', `/collections/${first}/items`, { collection_item_id: items.a }))
        .statusCode,
    ).toBe(201);
    expect(
      (await req('POST', `/collections/${second}/items`, { collection_item_id: items.a }))
        .statusCode,
    ).toBe(201);
    // Revincular é idempotente (sem duplicar).
    await req('POST', `/collections/${first}/items`, { collection_item_id: items.a });
    const memberships = await prisma.collectionMembership.count({
      where: { collectionId: first, collectionItemId: items.a },
    });
    expect(memberships).toBe(1);

    // Aparece nas duas pastas; no inventário completo a carta continua uma posição só.
    expect((await req('GET', `/collections/${first}`)).json().items).toHaveLength(1);
    expect((await req('GET', `/collections/${second}`)).json().items).toHaveLength(1);
    const inv = (await req('GET', '/collection'))
      .json()
      .items.filter((i: { id: string }) => i.id === items.a);
    expect(inv).toHaveLength(1);

    // Desvincular de uma mantém na outra e no inventário.
    await req('DELETE', `/collections/${first}/items/${items.a}`);
    expect((await req('GET', `/collections/${first}`)).json().items).toHaveLength(0);
    expect((await req('GET', `/collections/${second}`)).json().items).toHaveLength(1);
    expect(await prisma.collectionItem.findUnique({ where: { id: items.a } })).not.toBeNull();
  });

  it('não vincula item de outro usuário nem a pasta de outro (FR-010)', async () => {
    const mine = await createCollection(`Posse ${tok}`);
    const otherItem = await prisma.collectionItem.create({
      data: {
        userId: otherUserId,
        cardId: cards.b,
        condition: 'good',
        language: 'en',
        variant: 'normal',
        quantity: 1,
      },
    });
    expect(
      (await req('POST', `/collections/${mine}/items`, { collection_item_id: otherItem.id }))
        .statusCode,
    ).toBe(404);
    await prisma.collectionItem.delete({ where: { id: otherItem.id } });
  });

  it('remover o item do inventário remove os vínculos em cascata (FR-011)', async () => {
    const id = await createCollection(`Cascata ${tok}`);
    const temp = await makeItem(cards.b, 1);
    await req('POST', `/collections/${id}/items`, { collection_item_id: temp });
    expect((await req('GET', `/collections/${id}`)).json().items).toHaveLength(1);

    await req('DELETE', `/collection/items/${temp}`); // remove do inventário
    expect((await req('GET', `/collections/${id}`)).json().items).toHaveLength(0);
    expect(await prisma.collectionMembership.count({ where: { collectionItemId: temp } })).toBe(0);
  });
});

describe('US3 — recorte com estatísticas próprias (FR-012..014)', () => {
  it('resumo = valoração reusada da US4; item sem preço fica fora do total', async () => {
    const id = await createCollection(`Recorte ${tok}`);
    await req('POST', `/collections/${id}/items`, { collection_item_id: items.a }); // 2×10.000
    await req('POST', `/collections/${id}/items`, { collection_item_id: items.c }); // sem preço, qty 3

    const body = (await req('GET', `/collections/${id}`)).json();
    expect(body.summary).toEqual({
      total_cents: 20_000,
      priced_items: 1,
      unpriced_items: 1,
      distinct_cards: 2,
      total_quantity: 5,
    });
    // Itens no mesmo shape da listagem do inventário.
    const priced = body.items.find((i: { card: { id: string } }) => i.card.id === cards.a);
    expect(priced).toMatchObject({ quantity: 2, position_value_cents: 20_000 });
    expect(priced.price.price_cents).toBe(10_000);
    const unpriced = body.items.find((i: { card: { id: string } }) => i.card.id === cards.c);
    expect(unpriced.position_value_cents).toBeNull();
  });

  it('operações de pasta não alteram o dashboard geral (US4, SC-005)', async () => {
    const before = (await req('GET', '/stats/overview')).json();
    const id = await createCollection(`Sem impacto ${tok}`);
    await req('POST', `/collections/${id}/items`, { collection_item_id: items.b });
    await req('DELETE', `/collections/${id}`);
    const after = (await req('GET', '/stats/overview')).json();
    expect(after.total_cents).toBe(before.total_cents);
    expect(after.distinct_cards).toBe(before.distinct_cards);
    expect(after.total_quantity).toBe(before.total_quantity);
  });
});

describe('US4 — hub (FR-015)', () => {
  it('lista as pastas com resumo por recorte (cartas distintas · unidades · valor)', async () => {
    const id = await createCollection(`Hub ${tok}`);
    await req('POST', `/collections/${id}/items`, { collection_item_id: items.a }); // 20.000
    await req('POST', `/collections/${id}/items`, { collection_item_id: items.b }); // 5.000

    const hub = (await req('GET', '/collections')).json();
    const entry = hub.collections.find((c: { id: string }) => c.id === id);
    expect(entry.summary).toMatchObject({
      total_cents: 25_000,
      priced_items: 2,
      distinct_cards: 2,
      total_quantity: 3,
    });
  });
});
