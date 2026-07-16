import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { loadConfig } from '../../src/lib/config.js';
import { unauthorized } from '../../src/lib/errors.js';
import type { AuthUser } from '../../src/modules/auth/plugin.js';

/**
 * Teste de integração da US10 (T059): busca com filtros, cache/ETag das rotas 🔓 e ausência de
 * dados de posse para o visitante (FR-068–FR-072, SC-020/SC-021).
 */

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'postgresql://poketche:poketche@localhost:5435/poketche_test';

const userId = randomUUID();
const uniq = userId.slice(0, 8);
const setExternalId = `exp-set-${uniq}`;
// Nomes exclusivos: a busca ranqueia sobre todas as traduções do banco e as suítes rodam em
// paralelo — nomes reais de carta colidiriam com as fixtures da US2.
const NAME_RARE = `Explorix ${uniq}`;
const NAME_COMMON = `Explorito ${uniq}`;
const NAME_UNPRICED = `Explorusto ${uniq}`;

let prisma: PrismaClient;
let app: FastifyInstance;
let setId: string;
let rareId: string;
let commonId: string;
let unpricedId: string;

const auth = { 'x-test-user-id': userId, 'x-test-email': `exp_${uniq}@example.com` };

function img(n: string) {
  return { imageSmallUrl: `https://src/${n}/low.png`, imageLargeUrl: `https://src/${n}/high.png` };
}

async function makeCard(n: string, name: string, rarity: string, types: string[]) {
  const card = await prisma.card.create({
    data: {
      externalId: `${setExternalId}-${n}`,
      setId,
      number: n,
      rarity,
      supertype: 'Pokémon',
      subtypes: [],
      types,
      translations: {
        create: [
          { language: 'en', name: `${name} EN`, source: 'pokemontcgio', ...img(`${n}-en`) },
          { language: 'pt', name, source: 'tcgdex', ...img(`${n}-pt`) },
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
    // Espelha a auth real: sem credencial → 401, e não um 500 de stub. Este teste depende
    // disso para provar que o visitante não alcança dados de posse.
    authOverride: (req): AuthUser => {
      const id = req.headers['x-test-user-id'];
      if (typeof id !== 'string') throw unauthorized('token ausente');
      return { id, role: 'user' };
    },
  });
  await app.ready();

  const set = await prisma.cardSet.create({
    data: {
      externalId: setExternalId,
      name: 'Explorer Set',
      series: 'Test',
      totalCards: 4,
      releaseDate: new Date('2026-01-15'),
      logoUrl: 'https://src/logo.png',
    },
  });
  setId = set.id;

  // Números fora de ordem lexicográfica: "10" tem que vir depois de "2" na grade (FR-068).
  rareId = await makeCard('2', NAME_RARE, 'Rare', ['Fire']);
  commonId = await makeCard('10', NAME_COMMON, 'Common', ['Grass', 'Water']);
  unpricedId = await makeCard('1', NAME_UNPRICED, 'Common', ['Fire']);

  await prisma.cardPrice.createMany({
    data: [
      {
        cardId: rareId,
        condition: null,
        variant: 'normal',
        priceCents: 50_000,
        source: 'intl_usd_fx',
      },
      {
        cardId: commonId,
        condition: null,
        variant: 'normal',
        priceCents: 1_000,
        source: 'intl_usd_fx',
      },
    ],
  });

  await prisma.userProfile.create({ data: { id: userId, displayName: 'Explorador' } });
  await prisma.collectionItem.create({
    data: {
      userId,
      cardId: rareId,
      condition: 'near_mint',
      language: 'pt',
      variant: 'normal',
      quantity: 2,
    },
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

describe('US10 — explorador: navegação pública (SC-020)', () => {
  it('lista de edições traz logo, data e total, com cache e ETag', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/catalog/sets' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toContain('max-age');
    expect(res.headers.etag).toBeTruthy();
    const set = res
      .json()
      .sets.find((s: { external_id: string }) => s.external_id === setExternalId);
    expect(set).toMatchObject({
      name: 'Explorer Set',
      total_cards: 4,
      logo_url: 'https://src/logo.png',
    });
    expect(set.release_date).toContain('2026-01-15');
  });

  it('ETag revalida com 304 e devolve o ETag no 304 (SC-021)', async () => {
    // Revalida na grade da própria edição: o ETag de /catalog/sets depende do MAX(synced_at) de
    // TODAS as edições, e as suítes rodam em paralelo criando as suas — daria falso negativo.
    const url = `/api/v1/catalog/sets/${setId}/cards`;
    const first = await app.inject({ method: 'GET', url });
    const etag = first.headers.etag as string;
    const second = await app.inject({ method: 'GET', url, headers: { 'if-none-match': etag } });
    expect(second.statusCode).toBe(304);
    expect(second.body).toBe('');
    // O 304 precisa devolver o ETag, senão o cliente perde a validação na próxima volta.
    expect(second.headers.etag).toBe(etag);
  });

  it('grade da edição ordena por número (2 antes de 10, não lexicográfico)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/catalog/sets/${setExternalId}/cards`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.cards.map((c: { number: string }) => c.number)).toEqual(['1', '2', '10']);
    expect(body.total).toBe(3);
    expect(body.has_more).toBe(false);
    expect(body.cards[0].image_small_url).toContain('/catalog/images/');
  });

  it('grade aceita o uuid da edição e pagina', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/catalog/sets/${setId}/cards?page=1&limit=2`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.cards).toHaveLength(2);
    expect(body.has_more).toBe(true);

    const page2 = await app.inject({
      method: 'GET',
      url: `/api/v1/catalog/sets/${setId}/cards?page=2&limit=2`,
    });
    expect(page2.json().cards.map((c: { number: string }) => c.number)).toEqual(['10']);
    expect(page2.json().has_more).toBe(false);
  });

  it('detalhe da carta abre sem conta, com preço de mercado e resumo do histórico (FR-070)', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/v1/catalog/cards/${rareId}` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.name).toBe(NAME_RARE);
    expect(body.image_large_url).toContain('/catalog/images/');
    expect(body.set).toMatchObject({ external_id: setExternalId, name: 'Explorer Set' });
    // Sem contexto de item, o preço vem com a condição/variante a que se refere.
    expect(body.market_price).toMatchObject({
      price_cents: 50_000,
      source: 'intl_usd_fx',
      variant: 'normal',
      condition: null,
    });
    // Sem snapshots: histórico indisponível e variação null, sem interpolar (FR-042).
    expect(body.history_available).toBe(false);
    expect(body.change_30d).toBeNull();
    expect(res.headers.etag).toBeTruthy();
  });

  it('carta sem cotação vem com market_price null, não erro', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/v1/catalog/cards/${unpricedId}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().market_price).toBeNull();
  });

  it('edição e carta inexistentes dão 404', async () => {
    expect(
      (await app.inject({ method: 'GET', url: '/api/v1/catalog/sets/nao-existe/cards' }))
        .statusCode,
    ).toBe(404);
    const res = await app.inject({ method: 'GET', url: `/api/v1/catalog/cards/${randomUUID()}` });
    expect(res.statusCode).toBe(404);
  });
});

describe('US10 — busca com filtros (FR-069, SC-021)', () => {
  it('busca por nome em português continua ranqueando por relevância', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/catalog/cards?q=${encodeURIComponent(NAME_RARE)}&lang=pt`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().results[0].id).toBe(rareId);
  });

  it('navega só com filtros, sem q (explorador)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/catalog/cards?set=${setExternalId}`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.total).toBe(3);
    expect(body.results).toHaveLength(3);
  });

  it('filtra por raridade e por tipo, combinando com a edição', async () => {
    const rare = await app.inject({
      method: 'GET',
      url: `/api/v1/catalog/cards?set=${setExternalId}&rarity=Rare`,
    });
    expect(rare.json().results.map((r: { id: string }) => r.id)).toEqual([rareId]);

    const fire = await app.inject({
      method: 'GET',
      url: `/api/v1/catalog/cards?set=${setExternalId}&type=Fire`,
    });
    expect(fire.json().total).toBe(2);

    const water = await app.inject({
      method: 'GET',
      url: `/api/v1/catalog/cards?set=${setExternalId}&type=Water`,
    });
    expect(water.json().results.map((r: { id: string }) => r.id)).toEqual([commonId]);
  });

  it('filtro de preço exclui cartas sem cotação e indica quantas (FR-069)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/catalog/cards?set=${setExternalId}&price_min=500&price_max=100000`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.results.map((r: { id: string }) => r.id).sort()).toEqual([rareId, commonId].sort());
    // A carta sem cotação fica de fora — mas o payload não esconde isso.
    expect(body.unpriced_excluded).toBe(1);
  });

  it('faixa de preço estreita filtra de verdade', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/catalog/cards?set=${setExternalId}&price_min=0&price_max=2000`,
    });
    expect(res.json().results.map((r: { id: string }) => r.id)).toEqual([commonId]);
  });

  it('filtro aplicado na mesma consulta que ordena: página não encolhe', async () => {
    // Com o filtro depois do ranking, pedir 2 devolveria menos que 2 (as outras cartas do banco
    // ocupariam o top-N e sumiriam no filtro).
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/catalog/cards?set=${setExternalId}&limit=2&page=1`,
    });
    expect(res.json().results).toHaveLength(2);
    expect(res.json().has_more).toBe(true);
  });

  it('price_min maior que price_max é 400', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/catalog/cards?price_min=100&price_max=10',
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('US10 — posse e completude (FR-071/FR-072)', () => {
  it('visitante não recebe dado de posse: rota de completude exige conta', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/catalog/sets/${setExternalId}/completion`,
    });
    expect(res.statusCode).toBe(401);
  });

  it('payload público do catálogo não carrega nada por usuário (cacheável)', async () => {
    const grid = await app.inject({ method: 'GET', url: `/api/v1/catalog/sets/${setId}/cards` });
    expect(JSON.stringify(grid.json())).not.toContain('quantity');
    expect(JSON.stringify(grid.json())).not.toContain('owned');
    const detail = await app.inject({ method: 'GET', url: `/api/v1/catalog/cards/${rareId}` });
    expect(JSON.stringify(detail.json())).not.toContain('owned');
  });

  it('completude reflete exatamente possuídas/faltantes da coleção (SC-021)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/catalog/sets/${setExternalId}/completion`,
      headers: auth,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.owned).toBe(1);
    expect(body.total).toBe(4); // total impresso da edição
    expect(body.catalog_cards).toBe(3); // sincronizadas até agora
    expect(body.pct).toBe(25);
    expect(body.owned_cards).toEqual([{ card_id: rareId, quantity: 2 }]);
    expect(body.missing_card_ids.sort()).toEqual([commonId, unpricedId].sort());
  });

  it('mesma carta em condições diferentes conta uma vez, mas soma as cópias', async () => {
    await prisma.collectionItem.create({
      data: {
        userId,
        cardId: rareId,
        condition: 'played',
        language: 'en',
        variant: 'normal',
        quantity: 3,
      },
    });
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/catalog/sets/${setExternalId}/completion`,
      headers: auth,
    });
    const body = res.json();
    expect(body.owned).toBe(1);
    expect(body.owned_cards).toEqual([{ card_id: rareId, quantity: 5 }]);
  });

  it('posse do detalhe vem do filtro card_id da coleção (FR-071)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/collection?card_id=${rareId}`,
      headers: auth,
    });
    expect(res.statusCode).toBe(200);
    const items = res.json().items;
    expect(items).toHaveLength(2);
    expect(items.every((i: { card: { id: string } }) => i.card.id === rareId)).toBe(true);

    const none = await app.inject({
      method: 'GET',
      url: `/api/v1/collection?card_id=${unpricedId}`,
      headers: auth,
    });
    expect(none.json().items).toEqual([]);
  });

  it('anúncios da carta: rota pública responde vazia até a US6 criar anúncios', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/catalog/cards/${rareId}/listings`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ card_id: rareId, listings: [] });
  });
});
