import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { loadConfig } from '../../src/lib/config.js';
import type { AuthUser } from '../../src/modules/auth/plugin.js';
import { runWishlistAlerts } from '../../src/jobs/wishlist-alerts.js';
import { upsertCardPrice } from '../../src/jobs/price-refresh.js';
import { NoopPushProvider } from '../../src/integrations/push/index.js';

/**
 * Teste de integração da US9 (T061/T062/T063): CRUD de wishlists, indicadores da tela
 * (preço/alvo/diferença/já-na-coleção), pergunta de remoção ao adquirir (FR-052) e o job de
 * alertas com rearme e toggles. Banco de teste efêmero (:5435).
 */

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'postgresql://poketche:poketche@localhost:5435/poketche_test';

const userId = randomUUID();
const otherUserId = randomUUID();
const tok = userId.slice(0, 8);
const setExt = `wish-${tok}`;
const auth = { 'x-test-user-id': userId };
const otherAuth = { 'x-test-user-id': otherUserId };

// Nomes exclusivos: o banco é compartilhado entre suítes em paralelo e a busca é por trigram.
const NAME = {
  target: `Targetmon-${tok}`, // cai abaixo do alvo
  pricey: `Priceymon-${tok}`, // fica acima do alvo
  nopriced: `Nopricedmon-${tok}`, // sem cotação
  owned: `Ownedmon-${tok}`, // já na coleção
};

let prisma: PrismaClient;
let app: FastifyInstance;
const cards: Record<string, string> = {};

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

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

/**
 * Cotação sem condição (fonte internacional). Reusa o upsert do `price-refresh`: o unique real
 * é `NULLS NOT DISTINCT` em SQL manual, que o `where` tipado do Prisma não expressa com
 * `condition: null`.
 */
async function setPrice(cardId: string, priceCents: number): Promise<void> {
  await upsertCardPrice(prisma, cardId, {
    condition: null,
    variant: 'normal',
    priceCents,
    source: 'intl_usd_fx',
    fxRate: null,
    fetchedAt: new Date(),
  });
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
    data: { externalId: setExt, name: `Wish Set ${tok}`, series: 'Test', totalCards: 4 },
  });
  await prisma.userProfile.createMany({
    data: [
      { id: userId, displayName: 'Colecionador' },
      { id: otherUserId, displayName: 'Outro' },
    ],
  });

  cards.target = await makeCard(set.id, '1', NAME.target);
  cards.pricey = await makeCard(set.id, '2', NAME.pricey);
  cards.nopriced = await makeCard(set.id, '3', NAME.nopriced);
  cards.owned = await makeCard(set.id, '4', NAME.owned);

  await setPrice(cards.target, 9_000); // alvo 10.000 → atingido
  await setPrice(cards.pricey, 20_000); // alvo 10.000 → acima
  await setPrice(cards.owned, 5_000);
  // nopriced fica sem cotação de propósito (FR-049)

  await prisma.collectionItem.create({
    data: {
      userId,
      cardId: cards.owned,
      condition: 'near_mint',
      language: 'en',
      variant: 'normal',
      quantity: 2,
    },
  });
});

afterAll(async () => {
  await app.close();
  await prisma.wishlist.deleteMany({ where: { userId: { in: [userId, otherUserId] } } });
  await prisma.pushToken.deleteMany({ where: { userId: { in: [userId, otherUserId] } } });
  await prisma.collectionItem.deleteMany({ where: { userId: { in: [userId, otherUserId] } } });
  await prisma.cardPrice.deleteMany({ where: { card: { set: { externalId: setExt } } } });
  await prisma.userProfile.deleteMany({ where: { id: { in: [userId, otherUserId] } } });
  await prisma.card.deleteMany({ where: { set: { externalId: setExt } } });
  await prisma.cardSet.deleteMany({ where: { externalId: setExt } });
  await prisma.$disconnect();
});

const req = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: unknown) =>
  app.inject({ method, url: `/api/v1${url}`, headers: auth, ...(payload ? { payload } : {}) });

async function makeList(name: string, notifications = true): Promise<string> {
  const res = await req('POST', '/wishlists', { name, notifications_enabled: notifications });
  return res.json().id as string;
}

describe('US9 — CRUD de wishlists (FR-044)', () => {
  it('cria, lista, renomeia e exclui', async () => {
    const create = await req('POST', '/wishlists', { name: 'Completar Base Set' });
    expect(create.statusCode).toBe(201);
    const id = create.json().id;
    expect(create.json()).toMatchObject({
      name: 'Completar Base Set',
      notifications_enabled: true,
    });

    const list = await req('GET', '/wishlists');
    expect(list.json().wishlists.some((w: { id: string }) => w.id === id)).toBe(true);

    const patch = await req('PATCH', `/wishlists/${id}`, {
      name: 'Base Set',
      notifications_enabled: false,
    });
    expect(patch.json()).toMatchObject({ name: 'Base Set', notifications_enabled: false });

    expect((await req('DELETE', `/wishlists/${id}`)).statusCode).toBe(200);
    expect((await req('GET', `/wishlists/${id}`)).statusCode).toBe(404);
  });

  it('wishlist de outro usuário responde 404 (não 403 — não revela existência)', async () => {
    const id = await makeList(`Privada ${tok}`);
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/wishlists/${id}`,
      headers: otherAuth,
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('US9 — itens e preço-alvo (FR-045)', () => {
  it('adiciona carta com alvo; duplicata na mesma lista é 409', async () => {
    const id = await makeList(`Itens ${tok}`);
    const add = await req('POST', `/wishlists/${id}/items`, {
      card_id: cards.target,
      target_price_cents: 10_000,
    });
    expect(add.statusCode).toBe(201);
    expect(add.json()).toMatchObject({ target_price_cents: 10_000 });

    const dup = await req('POST', `/wishlists/${id}/items`, { card_id: cards.target });
    expect(dup.statusCode).toBe(409);
  });

  it('rejeita alvo <= 0 (FR-045)', async () => {
    const id = await makeList(`Alvo inválido ${tok}`);
    const res = await req('POST', `/wishlists/${id}/items`, {
      card_id: cards.target,
      target_price_cents: 0,
    });
    expect(res.statusCode).toBe(400);
  });

  it('edita o alvo e rearma o alerta (FR-045/FR-047)', async () => {
    const id = await makeList(`Edita ${tok}`);
    const add = await req('POST', `/wishlists/${id}/items`, {
      card_id: cards.target,
      target_price_cents: 8_000,
    });
    const itemId = add.json().id;
    // Simula um item que já notificou: mudar o alvo tem de rearmá-lo.
    await prisma.wishlistItem.update({
      where: { id: itemId },
      data: { alertState: 'notified', lastNotifiedAt: new Date() },
    });

    const patch = await req('PATCH', `/wishlists/${id}/items/${itemId}`, {
      target_price_cents: 12_000,
    });
    expect(patch.json().target_price_cents).toBe(12_000);
    const after = await prisma.wishlistItem.findUniqueOrThrow({ where: { id: itemId } });
    expect(after.alertState).toBe('armed');
    expect(after.lastNotifiedAt).toBeNull();
  });

  it('atalho em lote a partir das faltantes da edição (FR-072), ignorando repetidas', async () => {
    const id = await makeList(`Lote ${tok}`);
    const first = await req('POST', `/wishlists/${id}/items`, {
      card_ids: [cards.target, cards.pricey],
    });
    expect(first.json()).toMatchObject({ added: 2, ignored: 0 });

    // Reenviar o mesmo lote é idempotente — o atalho pode ser tocado duas vezes.
    const again = await req('POST', `/wishlists/${id}/items`, {
      card_ids: [cards.target, cards.nopriced],
    });
    expect(again.json()).toMatchObject({ added: 1, ignored: 1 });
  });

  it('remove item da wishlist', async () => {
    const id = await makeList(`Remove ${tok}`);
    const add = await req('POST', `/wishlists/${id}/items`, { card_id: cards.target });
    expect((await req('DELETE', `/wishlists/${id}/items/${add.json().id}`)).statusCode).toBe(200);
    expect((await req('GET', `/wishlists/${id}`)).json().items).toHaveLength(0);
  });
});

describe('US9 — indicadores da tela (FR-049/FR-051)', () => {
  it('preço atual, alvo, diferença e "atingiu o alvo"', async () => {
    const id = await makeList(`Indicadores ${tok}`);
    await req('POST', `/wishlists/${id}/items`, {
      card_id: cards.target,
      target_price_cents: 10_000,
    });
    await req('POST', `/wishlists/${id}/items`, {
      card_id: cards.pricey,
      target_price_cents: 10_000,
    });

    const body = (await req('GET', `/wishlists/${id}`)).json();
    const target = body.items.find((i: { card: { id: string } }) => i.card.id === cards.target);
    expect(target).toMatchObject({
      target_reached: true,
      difference_cents: -1_000, // 9.000 − 10.000: R$10 abaixo do alvo
      price_available: true,
      price_variant: 'normal',
    });
    expect(target.price.price_cents).toBe(9_000);

    const pricey = body.items.find((i: { card: { id: string } }) => i.card.id === cards.pricey);
    expect(pricey).toMatchObject({ target_reached: false, difference_cents: 10_000 });
    expect(body.summary).toMatchObject({ item_count: 2, targets_reached: 1 });
  });

  it('carta sem cotação: "preço indisponível", sem alvo atingido (FR-049)', async () => {
    const id = await makeList(`Sem preço ${tok}`);
    await req('POST', `/wishlists/${id}/items`, {
      card_id: cards.nopriced,
      target_price_cents: 10_000,
    });
    const item = (await req('GET', `/wishlists/${id}`)).json().items[0];
    expect(item).toMatchObject({
      price_available: false,
      price: null,
      difference_cents: null,
      target_reached: false,
    });
    expect((await req('GET', `/wishlists/${id}`)).json().summary.unpriced_items).toBe(1);
  });

  it('sinaliza carta já na coleção (FR-051)', async () => {
    const id = await makeList(`Já possuo ${tok}`);
    await req('POST', `/wishlists/${id}/items`, { card_id: cards.owned });
    await req('POST', `/wishlists/${id}/items`, { card_id: cards.target });
    const body = (await req('GET', `/wishlists/${id}`)).json();
    const owned = body.items.find((i: { card: { id: string } }) => i.card.id === cards.owned);
    expect(owned.in_collection).toMatchObject({ owned: true, quantity: 2 });
    const target = body.items.find((i: { card: { id: string } }) => i.card.id === cards.target);
    expect(target.in_collection).toMatchObject({ owned: false, quantity: 0 });
  });

  it('item sem alvo não tem diferença nem alvo atingido', async () => {
    const id = await makeList(`Sem alvo ${tok}`);
    await req('POST', `/wishlists/${id}/items`, { card_id: cards.target });
    const item = (await req('GET', `/wishlists/${id}`)).json().items[0];
    expect(item).toMatchObject({
      target_price_cents: null,
      difference_cents: null,
      target_reached: false,
    });
    expect(item.price.price_cents).toBe(9_000);
  });
});

describe('US9 — pergunta de remoção ao adquirir (FR-052)', () => {
  const addToCollection = (cardId: string) =>
    req('POST', '/collection/items', {
      card_id: cardId,
      condition: 'near_mint',
      language: 'en',
      quantity: 1,
      acquisition_price_cents: 5_000,
    });

  beforeEach(async () => {
    // Listas das suítes anteriores contêm estas cartas — limpar é o que torna "fora de qualquer
    // wishlist" verdadeiro neste bloco.
    await prisma.wishlist.deleteMany({ where: { userId } });
    await prisma.userProfile.update({ where: { id: userId }, data: { wishlistAutoRemove: false } });
  });

  it('registrar carta em wishlist devolve os casamentos p/ o app perguntar', async () => {
    const listId = await makeList(`Match ${tok}`);
    await req('POST', `/wishlists/${listId}/items`, {
      card_id: cards.pricey,
      target_price_cents: 15_000,
    });

    const res = await addToCollection(cards.pricey);
    expect(res.json().wishlist_auto_removed).toBe(false);
    expect(res.json().wishlist_matches).toHaveLength(1);
    expect(res.json().wishlist_matches[0]).toMatchObject({
      wishlist_id: listId,
      target_price_cents: 15_000,
      removed: false,
    });
    // Sem a flag, o servidor não remove nada por conta própria.
    expect((await req('GET', `/wishlists/${listId}`)).json().items).toHaveLength(1);

    await prisma.wishlist.delete({ where: { id: listId } });
    await prisma.collectionItem.deleteMany({ where: { userId, cardId: cards.pricey } });
  });

  it('com auto-remoção ligada, o item sai da wishlist sem perguntar', async () => {
    const listId = await makeList(`Auto ${tok}`);
    await req('POST', `/wishlists/${listId}/items`, { card_id: cards.pricey });
    await prisma.userProfile.update({ where: { id: userId }, data: { wishlistAutoRemove: true } });

    const res = await addToCollection(cards.pricey);
    expect(res.json().wishlist_auto_removed).toBe(true);
    expect(res.json().wishlist_matches[0]).toMatchObject({ removed: true });
    expect((await req('GET', `/wishlists/${listId}`)).json().items).toHaveLength(0);

    await prisma.wishlist.delete({ where: { id: listId } });
    await prisma.collectionItem.deleteMany({ where: { userId, cardId: cards.pricey } });
  });

  it('carta fora de qualquer wishlist não gera casamento', async () => {
    const res = await addToCollection(cards.nopriced);
    expect(res.json().wishlist_matches).toEqual([]);
    await prisma.collectionItem.deleteMany({ where: { userId, cardId: cards.nopriced } });
  });
});

describe('US9 — push tokens (T062)', () => {
  it('registra o token e reaproveita o mesmo aparelho entre contas', async () => {
    const expoToken = `ExponentPushToken[${tok}]`;
    const res = await req('POST', '/me/push-tokens', { expo_token: expoToken, platform: 'ios' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ expo_token: expoToken, platform: 'ios' });

    // Mesmo aparelho, outra conta: o token migra — senão o push iria para o dono anterior.
    await app.inject({
      method: 'POST',
      url: '/api/v1/me/push-tokens',
      headers: otherAuth,
      payload: { expo_token: expoToken, platform: 'ios' },
    });
    const stored = await prisma.pushToken.findUniqueOrThrow({ where: { expoToken } });
    expect(stored.userId).toBe(otherUserId);

    await prisma.pushToken.delete({ where: { expoToken } });
  });
});

describe('US9 — job wishlist-alerts (T063, FR-046/FR-047/FR-048)', () => {
  let listId: string;
  let itemId: string;
  let push: NoopPushProvider;

  const run = (now: Date) =>
    runWishlistAlerts({ prisma, push, minIntervalMs: DAY }, { onlyUserId: userId, now });

  beforeEach(async () => {
    await prisma.wishlist.deleteMany({ where: { userId } });
    await prisma.pushToken.deleteMany({ where: { userId } });
    await prisma.pushToken.create({
      data: { userId, expoToken: `ExponentPushToken[job-${tok}]`, platform: 'android' },
    });
    await prisma.userProfile.update({
      where: { id: userId },
      data: { notificationsEnabled: true },
    });
    await setPrice(cards.target, 9_000);

    listId = await makeList(`Alertas ${tok}`);
    const add = await req('POST', `/wishlists/${listId}/items`, {
      card_id: cards.target,
      target_price_cents: 10_000,
    });
    itemId = add.json().id;
    push = new NoopPushProvider();
  });

  it('notifica uma vez ao atingir o alvo e não repete no ciclo seguinte (cenário 3 e 4)', async () => {
    const first = await run(new Date());
    expect(first.notified).toBe(1);
    expect(first.pushesSent).toBe(1);
    expect(push.sentMessages[0]?.body).toContain(NAME.target);
    expect(push.sentMessages[0]?.data).toMatchObject({
      type: 'wishlist_alert',
      card_id: cards.target,
    });

    // Preço segue abaixo do alvo: nada de novo, mesmo passado o intervalo mínimo.
    const second = await run(new Date(Date.now() + 2 * DAY));
    expect(second.notified).toBe(0);
    expect(push.sentMessages).toHaveLength(1);
  });

  it('rearma quando o preço sobe e volta a notificar quando cai de novo (FR-047)', async () => {
    await run(new Date());
    expect(push.sentMessages).toHaveLength(1);

    // Sobe acima do alvo → rearme.
    await setPrice(cards.target, 15_000);
    const up = await run(new Date(Date.now() + 2 * DAY));
    expect(up.rearmed).toBe(1);
    expect(await prisma.wishlistItem.findUniqueOrThrow({ where: { id: itemId } })).toMatchObject({
      alertState: 'armed',
    });

    // Cai de novo, com o intervalo mínimo já vencido → notifica.
    await setPrice(cards.target, 8_000);
    const down = await run(new Date(Date.now() + 3 * DAY));
    expect(down.notified).toBe(1);
    expect(push.sentMessages).toHaveLength(2);
  });

  it('oscilação dentro do intervalo mínimo não gera segundo push', async () => {
    await run(new Date());
    await setPrice(cards.target, 15_000);
    await run(new Date(Date.now() + 1 * HOUR)); // rearma
    await setPrice(cards.target, 8_000);
    const again = await run(new Date(Date.now() + 2 * HOUR)); // caiu logo depois
    expect(again.notified).toBe(0);
    expect(push.sentMessages).toHaveLength(1);
  });

  it('notificações desligadas na wishlist: sem push (FR-048)', async () => {
    await req('PATCH', `/wishlists/${listId}`, { notifications_enabled: false });
    const res = await run(new Date());
    expect(res.notified).toBe(0);
    expect(push.sentMessages).toHaveLength(0);
    // O indicador da tela continua mostrando o alvo atingido (FR-048).
    const item = (await req('GET', `/wishlists/${listId}`)).json().items[0];
    expect(item.target_reached).toBe(true);
  });

  it('notificações desligadas globalmente: sem push', async () => {
    await prisma.userProfile.update({
      where: { id: userId },
      data: { notificationsEnabled: false },
    });
    const res = await run(new Date());
    expect(res.notified).toBe(0);
    expect(push.sentMessages).toHaveLength(0);
  });

  it('carta sem cotação nunca alerta (FR-049)', async () => {
    await req('POST', `/wishlists/${listId}/items`, {
      card_id: cards.nopriced,
      target_price_cents: 99_000,
    });
    const res = await run(new Date());
    // Só a `target` alerta; a sem cotação fica de fora.
    expect(res.notified).toBe(1);
    expect(push.sentMessages).toHaveLength(1);
  });

  it('item sem alvo não entra na avaliação (FR-045)', async () => {
    await prisma.wishlistItem.update({
      where: { id: itemId },
      data: { targetPriceCents: null },
    });
    const res = await run(new Date());
    expect(res.itemsEvaluated).toBe(0);
    expect(push.sentMessages).toHaveLength(0);
  });

  it('mesma carta em duas wishlists → um único push (FR-046)', async () => {
    const second = await makeList(`Alertas 2 ${tok}`);
    await req('POST', `/wishlists/${second}/items`, {
      card_id: cards.target,
      target_price_cents: 11_000,
    });
    const res = await run(new Date());
    expect(res.notified).toBe(1);
    expect(push.sentMessages).toHaveLength(1);
    // Ambos os itens marcados: senão a outra lista re-notificaria a mesma queda amanhã.
    const items = await prisma.wishlistItem.findMany({ where: { wishlist: { userId } } });
    expect(items.every((i) => i.alertState === 'notified')).toBe(true);
  });

  it('sem aparelho registrado: estado avança e o ciclo não quebra', async () => {
    await prisma.pushToken.deleteMany({ where: { userId } });
    const res = await run(new Date());
    expect(res.usersWithoutToken).toBe(1);
    expect(res.pushesSent).toBe(0);
  });
});
