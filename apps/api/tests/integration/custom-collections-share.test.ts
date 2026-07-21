import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { loadConfig } from '../../src/lib/config.js';
import type { AuthUser } from '../../src/modules/auth/plugin.js';

/**
 * Integração da US5 (T028): compartilhamento público por coleção personalizada — gerar/revogar
 * link, respeito às flags de visibilidade, e 404 opaco para token revogado/pasta excluída.
 */

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'postgresql://poketche:poketche@localhost:5435/poketche_test';

const userId = randomUUID();
const tok = userId.slice(0, 8);
const setExt = `ccs-${tok}`;
const auth = { 'x-test-user-id': userId };

let prisma: PrismaClient;
let app: FastifyInstance;
let collectionId: string;

const req = (method: 'GET' | 'POST' | 'PUT', url: string, payload?: unknown) =>
  app.inject({ method, url: `/api/v1${url}`, headers: auth, ...(payload ? { payload } : {}) });

const publicView = (token: string) =>
  app.inject({ method: 'GET', url: `/api/v1/public/custom-collections/${token}` });

beforeAll(async () => {
  prisma = new PrismaClient({ datasourceUrl: TEST_URL });
  const config = loadConfig({ DATABASE_URL: TEST_URL, NODE_ENV: 'test' });
  app = await buildApp(config, {
    prismaClient: prisma,
    authOverride: (r): AuthUser => ({
      id: r.headers['x-test-user-id'] as string,
      role: 'user',
      email: 'dono@example.com',
    }),
  });
  await app.ready();

  const set = await prisma.cardSet.create({
    data: { externalId: setExt, name: `Share Set ${tok}`, series: 'Test', totalCards: 1 },
  });
  await prisma.userProfile.create({ data: { id: userId, displayName: 'Ash' } });
  const card = await prisma.card.create({
    data: {
      externalId: `${setExt}-1`,
      setId: set.id,
      number: '1',
      rarity: 'Rare',
      supertype: 'Pokémon',
      subtypes: [],
      types: ['Fire'],
      translations: {
        create: [
          {
            language: 'pt',
            name: `Sharemon-${tok}`,
            source: 'tcgdex',
            imageSmallUrl: 'https://s/low.png',
            imageLargeUrl: 'https://s/high.png',
          },
        ],
      },
    },
  });
  await prisma.cardPrice.create({
    data: {
      cardId: card.id,
      condition: null,
      variant: 'normal',
      priceCents: 10_000,
      source: 'intl_usd_fx',
    },
  });
  const item = await prisma.collectionItem.create({
    data: {
      userId,
      cardId: card.id,
      condition: 'near_mint',
      language: 'pt',
      variant: 'normal',
      quantity: 3,
    },
  });

  collectionId = (await req('POST', '/collections', { name: `Só Charizards ${tok}` })).json().id;
  await req('POST', `/collections/${collectionId}/items`, { collection_item_id: item.id });
});

afterAll(async () => {
  await app.close();
  await prisma.collection.deleteMany({ where: { userId } });
  await prisma.collectionItem.deleteMany({ where: { userId } });
  await prisma.cardPrice.deleteMany({ where: { card: { set: { externalId: setExt } } } });
  await prisma.userProfile.deleteMany({ where: { id: userId } });
  await prisma.card.deleteMany({ where: { set: { externalId: setExt } } });
  await prisma.cardSet.deleteMany({ where: { externalId: setExt } });
  await prisma.$disconnect();
});

describe('US5 — compartilhamento por link de coleção', () => {
  it('gera link e o visitante vê só o recorte, respeitando as flags (FR-019/020)', async () => {
    await req('PUT', `/collections/${collectionId}/visibility`, {
      show_cards: true,
      show_values: true,
      show_quantities: true,
    });
    const share = await req('POST', `/collections/${collectionId}/share-link`, {
      action: 'generate',
    });
    expect(share.json().status).toBe('public_link');
    const token = share.json().share_token as string;
    expect(share.json().share_url).toContain(`custom-collections/${token}`);

    const view = await publicView(token);
    expect(view.statusCode).toBe(200);
    const body = view.json();
    expect(body.owner.display_name).toBe('Ash');
    expect(body.collection.name).toBe(`Só Charizards ${tok}`);
    expect(body.items).toHaveLength(1);
    expect(body.items[0].position_value_cents).toBe(30_000); // 3 × 10.000, quantities visíveis
    expect(body.summary).toMatchObject({ total_cents: 30_000, priced_items: 1 });
    // Nunca expõe dado privado do dono.
    expect(body.items[0]).not.toHaveProperty('acquisition_price_cents');
    expect(body.items[0]).not.toHaveProperty('id');
    expect(view.headers['cache-control']).toBe('no-store');
  });

  it('flags restringem o que o link revela', async () => {
    await req('PUT', `/collections/${collectionId}/visibility`, {
      show_cards: true,
      show_values: false,
      show_quantities: false,
    });
    const token = (
      await req('POST', `/collections/${collectionId}/share-link`, { action: 'generate' })
    ).json().share_token;
    const body = (await publicView(token)).json();
    expect(body.summary).toBeNull();
    expect(body.items[0].price).toBeNull();
    expect(body.items[0].quantity).toBeNull();
    expect(body.stats.total_cards).toBeNull();
  });

  it('revogar invalida o link (FR-021)', async () => {
    const token = (
      await req('POST', `/collections/${collectionId}/share-link`, { action: 'generate' })
    ).json().share_token;
    expect((await publicView(token)).statusCode).toBe(200);
    await req('POST', `/collections/${collectionId}/share-link`, { action: 'revoke' });
    expect((await publicView(token)).statusCode).toBe(404);
  });

  it('token inexistente responde 404 opaco', async () => {
    expect((await publicView('token-que-nunca-existiu')).statusCode).toBe(404);
  });

  it('excluir a pasta derruba o link (SC-007)', async () => {
    const tempId = (await req('POST', '/collections', { name: `Temp ${tok}` })).json().id;
    const token = (
      await req('POST', `/collections/${tempId}/share-link`, { action: 'generate' })
    ).json().share_token;
    expect((await publicView(token)).statusCode).toBe(200);
    await app.inject({ method: 'DELETE', url: `/api/v1/collections/${tempId}`, headers: auth });
    expect((await publicView(token)).statusCode).toBe(404);
  });
});
