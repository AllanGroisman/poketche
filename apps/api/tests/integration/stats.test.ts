import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { loadConfig } from '../../src/lib/config.js';
import type { AuthUser } from '../../src/modules/auth/plugin.js';
import { runCollectionValueSnapshot } from '../../src/jobs/collection-value-snapshot.js';

/**
 * Teste de integração da US4 (T049): dashboard de estatísticas — valor total, distribuição,
 * rankings (valor/valorização/P&L) e completude — a partir de fixtures, além do job de snapshot
 * de valor (evolução). Banco de teste efêmero (:5435).
 */

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'postgresql://poketche:poketche@localhost:5435/poketche_test';

const userId = randomUUID();
const tok = userId.slice(0, 8);
const setAExt = `stats-a-${tok}`;
const setBExt = `stats-b-${tok}`;
const auth = { 'x-test-user-id': userId };

// Nomes únicos por execução e sem substrings comuns (ex.: "chari"/"bulba") — o banco de teste
// é compartilhado entre arquivos rodando em paralelo, e a busca do catálogo é por trigram.
const NAME = {
  top: `Topmon-${tok}`, // mais valiosa e maior valorização
  mid: `Midmon-${tok}`, // barata e em desvalorização
  noprice: `Nopricemon-${tok}`, // sem cotação
  other: `Othermon-${tok}`, // outra edição
};

let prisma: PrismaClient;
let app: FastifyInstance;

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

async function makeSet(ext: string, name: string, total: number): Promise<string> {
  const set = await prisma.cardSet.create({
    data: { externalId: ext, name, series: 'Test', totalCards: total },
  });
  return set.id;
}

async function makeCard(
  setId: string,
  ext: string,
  number: string,
  name: string,
  types: string[],
  rarity: string,
): Promise<string> {
  const card = await prisma.card.create({
    data: {
      externalId: ext,
      setId,
      number,
      rarity,
      supertype: 'Pokémon',
      subtypes: [],
      types,
      translations: {
        create: [
          {
            language: 'en',
            name,
            source: 'pokemontcgio',
            imageSmallUrl: `https://s/${ext}/low.png`,
            imageLargeUrl: `https://s/${ext}/high.png`,
          },
        ],
      },
    },
  });
  return card.id;
}

async function priceCard(cardId: string, priceCents: number): Promise<void> {
  await prisma.cardPrice.create({
    data: { cardId, condition: null, variant: 'normal', priceCents, source: 'intl_usd_fx' },
  });
}

const cards: Record<string, string> = {};

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

  const setA = await makeSet(setAExt, 'Set A', 4);
  const setB = await makeSet(setBExt, 'Set B', 10);
  await prisma.userProfile.create({ data: { id: userId, displayName: 'Colecionador' } });

  // top: caro, valorizando; mid: barato, desvalorizando; noprice: sem cotação; other: outro set.
  cards.top = await makeCard(setA, `${setAExt}-1`, '1', NAME.top, ['Fire'], 'Rare Holo');
  cards.mid = await makeCard(setA, `${setAExt}-2`, '2', NAME.mid, ['Water'], 'Rare');
  cards.noprice = await makeCard(setA, `${setAExt}-3`, '3', NAME.noprice, ['Grass'], 'Rare');
  cards.other = await makeCard(setB, `${setBExt}-1`, '1', NAME.other, ['Lightning'], 'Common');

  await priceCard(cards.top, 10000); // R$100
  await priceCard(cards.mid, 2000); // R$20
  await priceCard(cards.other, 500); // R$5
  // noprice sem cotação

  // Snapshots p/ o ranking de valorização (top subiu de 8000 → 10000 em 30d; mid caiu).
  await prisma.cardPriceSnapshot.createMany({
    data: [
      {
        cardId: cards.top,
        condition: null,
        variant: 'normal',
        priceCents: 8000,
        source: 'intl_usd_fx',
        fetchedAt: daysAgo(40),
      },
      {
        cardId: cards.top,
        condition: null,
        variant: 'normal',
        priceCents: 10000,
        source: 'intl_usd_fx',
        fetchedAt: daysAgo(1),
      },
      {
        cardId: cards.mid,
        condition: null,
        variant: 'normal',
        priceCents: 3000,
        source: 'intl_usd_fx',
        fetchedAt: daysAgo(40),
      },
      {
        cardId: cards.mid,
        condition: null,
        variant: 'normal',
        priceCents: 2000,
        source: 'intl_usd_fx',
        fetchedAt: daysAgo(1),
      },
    ],
  });

  await prisma.collectionItem.createMany({
    data: [
      {
        userId,
        cardId: cards.top,
        condition: 'near_mint',
        language: 'en',
        variant: 'normal',
        quantity: 2,
        acquisitionPriceCents: 6000,
      },
      {
        userId,
        cardId: cards.mid,
        condition: 'near_mint',
        language: 'en',
        variant: 'normal',
        quantity: 1,
        acquisitionPriceCents: 2500,
      },
      {
        userId,
        cardId: cards.noprice,
        condition: 'near_mint',
        language: 'en',
        variant: 'normal',
        quantity: 3,
      },
      {
        userId,
        cardId: cards.other,
        condition: 'near_mint',
        language: 'en',
        variant: 'normal',
        quantity: 1,
      },
    ],
  });
});

afterAll(async () => {
  await app.close();
  await prisma.collectionValueSnapshot.deleteMany({ where: { userId } });
  await prisma.collectionItem.deleteMany({ where: { userId } });
  await prisma.cardPriceSnapshot.deleteMany({
    where: { card: { set: { externalId: { in: [setAExt, setBExt] } } } },
  });
  await prisma.cardPrice.deleteMany({
    where: { card: { set: { externalId: { in: [setAExt, setBExt] } } } },
  });
  await prisma.userProfile.deleteMany({ where: { id: userId } });
  await prisma.card.deleteMany({ where: { set: { externalId: { in: [setAExt, setBExt] } } } });
  await prisma.cardSet.deleteMany({ where: { externalId: { in: [setAExt, setBExt] } } });
  await prisma.$disconnect();
});

const get = (url: string) => app.inject({ method: 'GET', url: `/api/v1${url}`, headers: auth });

describe('US4 — overview', () => {
  it('valor total = Σ preço×qty dos itens com cotação; itens sem preço à parte (FR-016)', async () => {
    const res = await get('/stats/overview');
    expect(res.statusCode).toBe(200);
    const body = res.json();
    // 2×10000 + 1×2000 + 1×500 = 22500; noprice (3) sem cotação.
    expect(body.total_cents).toBe(22500);
    expect(body.priced_items).toBe(3);
    expect(body.unpriced_items).toBe(1);
    expect(body.distinct_cards).toBe(4);
    expect(body.total_quantity).toBe(7);
  });
});

describe('US4 — distribution', () => {
  it('por edição soma o valor por set (FR-018)', async () => {
    const res = await get('/stats/distribution?by=set');
    const body = res.json();
    expect(body.by).toBe('set');
    const setA = body.buckets.find((b: { label: string }) => b.label === 'Set A')!;
    expect(setA.value_cents).toBe(22000); // top 20000 + mid 2000
    const setB = body.buckets.find((b: { label: string }) => b.label === 'Set B')!;
    expect(setB.value_cents).toBe(500);
  });

  it('por raridade agrupa por rarity', async () => {
    const res = await get('/stats/distribution?by=rarity');
    const body = res.json();
    const holo = body.buckets.find((b: { key: string }) => b.key === 'Rare Holo')!;
    expect(holo.value_cents).toBe(20000);
  });
});

describe('US4 — rankings', () => {
  it('top_value: mais valiosas por valor da posição (FR-019)', async () => {
    const res = await get('/stats/rankings?type=top_value&limit=5');
    const body = res.json();
    expect(body.entries[0].card.name).toBe(NAME.top);
    expect(body.entries[0].value_cents).toBe(20000);
    // noprice (sem cotação) não aparece
    expect(body.entries.some((e: { card: { name: string } }) => e.card.name === NAME.noprice)).toBe(
      false,
    );
  });

  it('gainers: valorização no período, sem interpolar (FR-020a)', async () => {
    const res = await get('/stats/rankings?type=gainers&period=30d');
    const body = res.json();
    expect(body.entries[0].card.name).toBe(NAME.top);
    expect(body.entries[0].variation).toMatchObject({ from_cents: 8000, change_cents: 2000 });
    // mid caiu → não é gainer
    expect(body.entries.some((e: { card: { name: string } }) => e.card.name === NAME.mid)).toBe(
      false,
    );
  });

  it('losers: desvalorização no período', async () => {
    const res = await get('/stats/rankings?type=losers&period=30d');
    const body = res.json();
    expect(body.entries[0].card.name).toBe(NAME.mid);
    expect(body.entries[0].variation.change_cents).toBe(-1000);
  });

  it('acquisition_pnl: só itens com preço de compra, por unidade (FR-020a)', async () => {
    const res = await get('/stats/rankings?type=acquisition_pnl');
    const body = res.json();
    // top 10000 vs compra 6000 → +4000; mid 2000 vs 2500 → -500.
    expect(body.entries.map((e: { card: { name: string } }) => e.card.name)).toEqual([
      NAME.top,
      NAME.mid,
    ]);
    expect(body.entries[0].gain_loss).toMatchObject({ basis: 'acquisition', change_cents: 4000 });
  });
});

describe('US4 — completion', () => {
  it('completude por edição = cartas distintas possuídas vs. total (FR-020)', async () => {
    const res = await get('/stats/completion');
    const body = res.json();
    const setA = body.sets.find((s: { set_name: string }) => s.set_name === 'Set A')!;
    expect(setA).toMatchObject({ owned: 3, total: 4, pct: 75 });
    const setB = body.sets.find((s: { set_name: string }) => s.set_name === 'Set B')!;
    expect(setB).toMatchObject({ owned: 1, total: 10, pct: 10 });
  });
});

describe('US4 — history + job de snapshot', () => {
  it('registra o valor da coleção e a evolução aparece no histórico (FR-017)', async () => {
    // Antes do job: sem histórico registrado.
    const empty = await get('/stats/history');
    expect(empty.json().history_available).toBe(false);

    // Job grava um snapshot com o valor atual; segundo dia grava outro (idempotente por dia).
    const r1 = await runCollectionValueSnapshot(
      { prisma },
      { onlyUserId: userId, now: daysAgo(1) },
    );
    expect(r1.snapshotsWritten).toBe(1);
    const r2 = await runCollectionValueSnapshot(
      { prisma },
      { onlyUserId: userId, now: new Date() },
    );
    expect(r2.snapshotsWritten).toBe(1);
    // Rodar de novo no mesmo dia não duplica.
    const r3 = await runCollectionValueSnapshot(
      { prisma },
      { onlyUserId: userId, now: new Date() },
    );
    expect(r3.snapshotsWritten).toBe(0);
    expect(r3.skippedExisting).toBe(1);

    const res = await get('/stats/history');
    const body = res.json();
    expect(body.history_available).toBe(true);
    expect(body.points).toHaveLength(2);
    expect(body.points[0].total_cents).toBe(22500);
    expect(body.current.total_cents).toBe(22500);
  });
});
