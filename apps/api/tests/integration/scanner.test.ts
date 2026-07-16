import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { loadConfig } from '../../src/lib/config.js';
import type { AuthUser } from '../../src/modules/auth/plugin.js';
import { StubCardIdentifier } from '../../src/integrations/identifier/index.js';
import { upsertCardPrice } from '../../src/jobs/price-refresh.js';

/**
 * Teste de integração da US5 (T075): fluxo capturas → revisão → confirm/discard. O identificador
 * é o `StubCardIdentifier` — o que se testa aqui é o fluxo de sessões, não o OCR (a precisão do
 * Tesseract é medida no Independent Test, em aparelho físico). Banco de teste efêmero (:5435).
 */

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'postgresql://poketche:poketche@localhost:5435/poketche_test';

const userId = randomUUID();
const otherUserId = randomUUID();
const tok = userId.slice(0, 8);
const setExt = `scan-${tok}`;
const auth = { 'x-test-user-id': userId };
const otherAuth = { 'x-test-user-id': otherUserId };

// Nomes exclusivos: o banco é compartilhado entre suítes em paralelo e a busca é por trigram.
const NAME = {
  pikachu: `Scanmon-${tok}`,
  charizard: `Scanzard-${tok}`,
  wished: `Scanwish-${tok}`,
};

let prisma: PrismaClient;
let app: FastifyInstance;
let identifier: StubCardIdentifier;
const cards: Record<string, string> = {};

/** Crop qualquer: o stub ignora o conteúdo, só registra que recebeu. */
const CROP = Buffer.from('imagem-de-carta').toString('base64');

async function makeCard(setId: string, number: string, name: string): Promise<string> {
  const card = await prisma.card.create({
    data: {
      externalId: `${setExt}-${number}`,
      setId,
      number,
      rarity: number === '2' ? 'Rare Holo' : 'Common',
      supertype: 'Pokémon',
      subtypes: [],
      types: ['Electric'],
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

beforeAll(async () => {
  prisma = new PrismaClient({ datasourceUrl: TEST_URL });
  const config = loadConfig({ DATABASE_URL: TEST_URL, NODE_ENV: 'test' });
  identifier = new StubCardIdentifier();
  app = await buildApp(config, {
    prismaClient: prisma,
    identifier,
    authOverride: (req): AuthUser => ({
      id: req.headers['x-test-user-id'] as string,
      role: 'user',
      email: 'colecionador@example.com',
    }),
  });
  await app.ready();

  const set = await prisma.cardSet.create({
    data: { externalId: setExt, name: `Scan Set ${tok}`, series: 'Test', totalCards: 3 },
  });
  await prisma.userProfile.createMany({
    data: [
      { id: userId, displayName: 'Colecionador' },
      { id: otherUserId, displayName: 'Outro' },
    ],
  });

  cards.pikachu = await makeCard(set.id, '1', NAME.pikachu);
  cards.charizard = await makeCard(set.id, '2', NAME.charizard);
  cards.wished = await makeCard(set.id, '3', NAME.wished);

  await upsertCardPrice(prisma, cards.pikachu, {
    condition: null,
    variant: 'normal',
    priceCents: 1_000,
    source: 'intl_usd_fx',
    fxRate: null,
    fetchedAt: new Date(),
  });
  await upsertCardPrice(prisma, cards.charizard, {
    condition: null,
    variant: 'normal',
    priceCents: 50_000,
    source: 'intl_usd_fx',
    fxRate: null,
    fetchedAt: new Date(),
  });
  // `wished` fica sem cotação de propósito.
});

afterAll(async () => {
  await app.close();
  await prisma.scanSession.deleteMany({ where: { userId: { in: [userId, otherUserId] } } });
  await prisma.wishlist.deleteMany({ where: { userId: { in: [userId, otherUserId] } } });
  await prisma.collectionItem.deleteMany({ where: { userId: { in: [userId, otherUserId] } } });
  await prisma.cardPrice.deleteMany({ where: { card: { set: { externalId: setExt } } } });
  await prisma.userProfile.deleteMany({ where: { id: { in: [userId, otherUserId] } } });
  await prisma.card.deleteMany({ where: { set: { externalId: setExt } } });
  await prisma.cardSet.deleteMany({ where: { externalId: setExt } });
  await prisma.$disconnect();
});

// Cada teste começa sem sessão aberta e sem coleção — a sessão pendente é única por usuário, e um
// resultado enfileirado no stub e não consumido vazaria para o teste seguinte.
beforeEach(async () => {
  identifier.reset();
  await prisma.scanSession.deleteMany({ where: { userId: { in: [userId, otherUserId] } } });
  await prisma.collectionItem.deleteMany({ where: { userId: { in: [userId, otherUserId] } } });
  await prisma.wishlist.deleteMany({ where: { userId } });
  await prisma.userProfile.update({ where: { id: userId }, data: { wishlistAutoRemove: false } });
});

const req = (
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  url: string,
  payload?: unknown,
  headers = auth,
) => app.inject({ method, url: `/api/v1${url}`, headers, ...(payload ? { payload } : {}) });

const identified = (cardId: string, name: string, language: 'en' | 'pt' = 'en') =>
  identifier.enqueue({
    card: {
      cardId,
      name,
      number: '1',
      setName: `Scan Set ${tok}`,
      language,
      confidence: 0.95,
    },
    candidates: [],
    language,
    languageDetected: true,
    confidence: 0.95,
  });

async function openSession(): Promise<string> {
  const res = await req('POST', '/scan/sessions', { camera: 'back' });
  return res.json().id as string;
}

/** Captura já resolvida (carta + condição), pronta para o confirm gravar. */
async function readyCapture(sessionId: string, cardId: string, name: string, quantity = 1) {
  identified(cardId, name);
  const res = await req('POST', `/scan/sessions/${sessionId}/captures`, { image_base64: CROP });
  const captureId = res.json().capture.id;
  await req('PATCH', `/scan/sessions/${sessionId}/captures/${captureId}`, {
    condition: 'near_mint',
    quantity,
  });
  return captureId;
}

describe('US5 — sessões (FR-059)', () => {
  it('cria sessão pendente e a devolve na recuperação', async () => {
    const create = await req('POST', '/scan/sessions', { camera: 'front', recorded: true });
    expect(create.statusCode).toBe(201);
    expect(create.json()).toMatchObject({ status: 'pending', camera: 'front', recorded: true });

    const pending = await req('GET', '/scan/sessions/pending');
    expect(pending.json().session).toMatchObject({ id: create.json().id, capture_count: 0 });
  });

  it('sessão pendente é única: a segunda criação dá 409', async () => {
    await openSession();
    const second = await req('POST', '/scan/sessions', {});
    expect(second.statusCode).toBe(409);
  });

  it('sem sessão aberta, a recuperação devolve null em vez de erro', async () => {
    const pending = await req('GET', '/scan/sessions/pending');
    expect(pending.statusCode).toBe(200);
    expect(pending.json().session).toBeNull();
  });

  it('lembra a câmera escolhida durante a sessão (FR-061)', async () => {
    const id = await openSession();
    const res = await req('PATCH', `/scan/sessions/${id}`, { camera: 'front' });
    expect(res.json().camera).toBe('front');
  });

  it('sessão de outro usuário responde 404, nunca 403', async () => {
    const id = await openSession();
    const res = await req('GET', `/scan/sessions/${id}`, undefined, otherAuth);
    expect(res.statusCode).toBe(404);
  });

  it('confirmar libera o slot: dá para abrir a próxima sessão', async () => {
    const first = await openSession();
    await readyCapture(first, cards.pikachu, NAME.pikachu);
    await req('POST', `/scan/sessions/${first}/confirm`);

    const second = await req('POST', '/scan/sessions', {});
    expect(second.statusCode).toBe(201);
  });

  it('sessão encerrada não aceita mais capturas', async () => {
    const id = await openSession();
    await req('POST', `/scan/sessions/${id}/discard`);
    const res = await req('POST', `/scan/sessions/${id}/captures`, { image_base64: CROP });
    expect(res.statusCode).toBe(409);
  });
});

describe('US5 — capturas (FR-022/FR-023/FR-053/FR-067)', () => {
  it('carta identificada com confiança entra como identified', async () => {
    const id = await openSession();
    identified(cards.pikachu, NAME.pikachu, 'pt');

    const res = await req('POST', `/scan/sessions/${id}/captures`, { image_base64: CROP });
    expect(res.statusCode).toBe(201);
    expect(res.json().capture).toMatchObject({
      status: 'identified',
      language: 'pt',
      language_detected: true,
      variant: 'normal',
      method: 'ocr',
      quantity: 1,
    });
    expect(res.json().capture.card.id).toBe(cards.pikachu);
    expect(identifier.received).toHaveLength(1);
  });

  it('identificação ambígua entra como "a revisar" com os candidatos, sem travar o fluxo', async () => {
    const id = await openSession();
    identifier.enqueue({
      card: null,
      candidates: [
        {
          cardId: cards.pikachu,
          name: NAME.pikachu,
          number: '1',
          setName: 's',
          language: 'en',
          confidence: 0.45,
        },
        {
          cardId: cards.charizard,
          name: NAME.charizard,
          number: '2',
          setName: 's',
          language: 'en',
          confidence: 0.3,
        },
      ],
      confidence: 0.45,
    });

    const res = await req('POST', `/scan/sessions/${id}/captures`, { image_base64: CROP });
    expect(res.statusCode).toBe(201);
    expect(res.json().capture).toMatchObject({ status: 'needs_review', card: null });
    expect(res.json().capture.candidates).toHaveLength(2);
  });

  it('idioma indeterminado assume en e fica marcado como não detectado (FR-067)', async () => {
    const id = await openSession();
    identifier.enqueue({ card: null, candidates: [], language: 'en', languageDetected: false });

    const res = await req('POST', `/scan/sessions/${id}/captures`, { image_base64: CROP });
    expect(res.json().capture).toMatchObject({ language: 'en', language_detected: false });
  });

  it('duplicata na mesma sessão incrementa a quantidade (FR-053)', async () => {
    const id = await openSession();
    identified(cards.pikachu, NAME.pikachu);
    const first = await req('POST', `/scan/sessions/${id}/captures`, { image_base64: CROP });
    identified(cards.pikachu, NAME.pikachu);
    const second = await req('POST', `/scan/sessions/${id}/captures`, { image_base64: CROP });

    expect(second.json().duplicate).toBe(true);
    expect(second.json().capture.id).toBe(first.json().capture.id);
    expect(second.json().capture.quantity).toBe(2);

    const session = await req('GET', `/scan/sessions/${id}`);
    expect(session.json().captures).toHaveLength(1);
  });

  it('duas capturas "a revisar" não são fundidas — podem ser cartas diferentes', async () => {
    const id = await openSession();
    identifier.enqueue({ card: null, candidates: [] });
    await req('POST', `/scan/sessions/${id}/captures`, { image_base64: CROP });
    identifier.enqueue({ card: null, candidates: [] });
    await req('POST', `/scan/sessions/${id}/captures`, { image_base64: CROP });

    const session = await req('GET', `/scan/sessions/${id}`);
    expect(session.json().captures).toHaveLength(2);
  });

  it('rejeita crop acima do limite configurado', async () => {
    const id = await openSession();
    const huge = Buffer.alloc(1025 * 1024, 1).toString('base64');
    const res = await req('POST', `/scan/sessions/${id}/captures`, { image_base64: huge });
    expect(res.statusCode).toBe(400);
  });
});

describe('US5 — revisão (FR-056)', () => {
  it('escolher a carta resolve o "a revisar" e marca o método como manual', async () => {
    const id = await openSession();
    identifier.enqueue({ card: null, candidates: [] });
    const capture = await req('POST', `/scan/sessions/${id}/captures`, { image_base64: CROP });
    const captureId = capture.json().capture.id;

    const res = await req('PATCH', `/scan/sessions/${id}/captures/${captureId}`, {
      card_id: cards.charizard,
      condition: 'played',
    });
    expect(res.json().capture).toMatchObject({ status: 'identified', method: 'manual' });
    expect(res.json().capture.card.id).toBe(cards.charizard);
  });

  it('corrigir o idioma à mão deixa de contar como detecção automática (FR-067)', async () => {
    const id = await openSession();
    identified(cards.pikachu, NAME.pikachu, 'en');
    const capture = await req('POST', `/scan/sessions/${id}/captures`, { image_base64: CROP });

    const res = await req('PATCH', `/scan/sessions/${id}/captures/${capture.json().capture.id}`, {
      language: 'pt',
    });
    expect(res.json().capture).toMatchObject({ language: 'pt', language_detected: false });
  });

  it('permite ajustar a variante que o OCR não distingue (reverse foil)', async () => {
    const id = await openSession();
    identified(cards.pikachu, NAME.pikachu);
    const capture = await req('POST', `/scan/sessions/${id}/captures`, { image_base64: CROP });

    const res = await req('PATCH', `/scan/sessions/${id}/captures/${capture.json().capture.id}`, {
      variant: 'reverse_foil',
    });
    expect(res.json().capture.variant).toBe('reverse_foil');
  });

  it('exclui captura errada', async () => {
    const id = await openSession();
    identified(cards.pikachu, NAME.pikachu);
    const capture = await req('POST', `/scan/sessions/${id}/captures`, { image_base64: CROP });

    const del = await req('DELETE', `/scan/sessions/${id}/captures/${capture.json().capture.id}`);
    expect(del.statusCode).toBe(204);
    const session = await req('GET', `/scan/sessions/${id}`);
    expect(session.json().captures).toHaveLength(0);
  });

  it('adiciona manualmente carta não detectada', async () => {
    const id = await openSession();
    const res = await req('POST', `/scan/sessions/${id}/manual`, {
      card_id: cards.charizard,
      condition: 'mint',
      quantity: 3,
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().capture).toMatchObject({
      status: 'identified',
      method: 'manual',
      quantity: 3,
    });
  });

  it('carta inexistente na revisão dá 404', async () => {
    const id = await openSession();
    const res = await req('POST', `/scan/sessions/${id}/manual`, { card_id: randomUUID() });
    expect(res.statusCode).toBe(404);
  });
});

describe('US5 — resumo da revisão (FR-057)', () => {
  it('soma valor, distribui por raridade/edição e aponta a mais valiosa', async () => {
    const id = await openSession();
    await readyCapture(id, cards.pikachu, NAME.pikachu, 2); // 2 × 10,00
    await readyCapture(id, cards.charizard, NAME.charizard); // 1 × 500,00

    const res = await req('GET', `/scan/sessions/${id}/summary`);
    const body = res.json();
    expect(body.total_cards).toBe(3);
    expect(body.total_value_cents).toBe(2 * 1_000 + 50_000);
    expect(body.most_valuable).toMatchObject({ value_cents: 50_000 });
    expect(body.by_rarity).toEqual(
      expect.arrayContaining([
        { rarity: 'Common', count: 2 },
        { rarity: 'Rare Holo', count: 1 },
      ]),
    );
    expect(body.by_set).toEqual([{ set_name: `Scan Set ${tok}`, count: 3 }]);
  });

  it('conta cartas sem cotação em vez de omiti-las do total', async () => {
    const id = await openSession();
    await readyCapture(id, cards.wished, NAME.wished);

    const res = await req('GET', `/scan/sessions/${id}/summary`);
    expect(res.json()).toMatchObject({ total_value_cents: 0, unpriced_cards: 1 });
  });

  it('conta as capturas "a revisar" à parte, fora das estatísticas', async () => {
    const id = await openSession();
    identifier.enqueue({ card: null, candidates: [] });
    await req('POST', `/scan/sessions/${id}/captures`, { image_base64: CROP });

    const res = await req('GET', `/scan/sessions/${id}/summary`);
    expect(res.json()).toMatchObject({ needs_review: 1, total_cards: 0 });
  });

  it('conta cartas em wishlist, sem contar a mesma carta duas vezes', async () => {
    const list = await req('POST', '/wishlists', { name: `Lista ${tok}` });
    await req('POST', `/wishlists/${list.json().id}/items`, { card_id: cards.wished });

    const id = await openSession();
    await readyCapture(id, cards.wished, NAME.wished, 2);
    await readyCapture(id, cards.pikachu, NAME.pikachu);

    const res = await req('GET', `/scan/sessions/${id}/summary`);
    expect(res.json().in_wishlists).toBe(1);
  });
});

describe('US5 — confirmação e descarte (FR-058)', () => {
  it('nada entra na coleção antes do confirm', async () => {
    const id = await openSession();
    await readyCapture(id, cards.pikachu, NAME.pikachu);

    const collection = await req('GET', '/collection');
    expect(collection.json().items).toHaveLength(0);
  });

  it('confirm grava na coleção e encerra a sessão', async () => {
    const id = await openSession();
    await readyCapture(id, cards.pikachu, NAME.pikachu, 2);

    const res = await req('POST', `/scan/sessions/${id}/confirm`);
    expect(res.json()).toMatchObject({ added_cards: 2, skipped_captures: 0 });

    const collection = await req('GET', '/collection');
    expect(collection.json().items).toHaveLength(1);
    expect(collection.json().items[0]).toMatchObject({ quantity: 2, condition: 'near_mint' });

    const session = await req('GET', `/scan/sessions/${id}`);
    expect(session.json().status).toBe('confirmed');
  });

  it('carta já possuída soma quantidade em vez de duplicar item (FR-009)', async () => {
    await prisma.collectionItem.create({
      data: {
        userId,
        cardId: cards.pikachu,
        condition: 'near_mint',
        language: 'en',
        variant: 'normal',
        quantity: 1,
      },
    });

    const id = await openSession();
    await readyCapture(id, cards.pikachu, NAME.pikachu, 2);
    await req('POST', `/scan/sessions/${id}/confirm`);

    const collection = await req('GET', '/collection');
    expect(collection.json().items).toHaveLength(1);
    expect(collection.json().items[0].quantity).toBe(3);
  });

  it('captura "a revisar" não entra na coleção e é reportada como ignorada', async () => {
    const id = await openSession();
    await readyCapture(id, cards.pikachu, NAME.pikachu);
    identifier.enqueue({ card: null, candidates: [] });
    await req('POST', `/scan/sessions/${id}/captures`, { image_base64: CROP });

    const res = await req('POST', `/scan/sessions/${id}/confirm`);
    expect(res.json()).toMatchObject({ added_cards: 1, skipped_captures: 1 });

    const collection = await req('GET', '/collection');
    expect(collection.json().items).toHaveLength(1);
  });

  it('sessão sem nenhuma captura resolvida não confirma (422)', async () => {
    const id = await openSession();
    identifier.enqueue({ card: null, candidates: [] });
    await req('POST', `/scan/sessions/${id}/captures`, { image_base64: CROP });

    const res = await req('POST', `/scan/sessions/${id}/confirm`);
    expect(res.statusCode).toBe(422);
  });

  it('descartar não altera a coleção (FR-058)', async () => {
    const id = await openSession();
    await readyCapture(id, cards.pikachu, NAME.pikachu);

    const res = await req('POST', `/scan/sessions/${id}/discard`);
    expect(res.json().status).toBe('discarded');

    const collection = await req('GET', '/collection');
    expect(collection.json().items).toHaveLength(0);
  });

  it('confirm devolve o casamento de wishlist da carta gravada (FR-052/FR-058)', async () => {
    const list = await req('POST', '/wishlists', { name: `Desejos ${tok}` });
    await req('POST', `/wishlists/${list.json().id}/items`, { card_id: cards.wished });

    const id = await openSession();
    await readyCapture(id, cards.wished, NAME.wished);

    const res = await req('POST', `/scan/sessions/${id}/confirm`);
    expect(res.json().wishlist_matches).toHaveLength(1);
    expect(res.json().wishlist_matches[0]).toMatchObject({
      wishlist_id: list.json().id,
      removed: false,
    });
    expect(res.json().wishlist_auto_removed).toBe(false);
  });

  it('duas capturas da mesma carta reportam o casamento uma vez só', async () => {
    const list = await req('POST', '/wishlists', { name: `Desejos ${tok}` });
    await req('POST', `/wishlists/${list.json().id}/items`, { card_id: cards.wished });

    const id = await openSession();
    // Mesma carta em condições diferentes = duas capturas distintas, um desejo só.
    await readyCapture(id, cards.wished, NAME.wished);
    const second = await req('POST', `/scan/sessions/${id}/manual`, {
      card_id: cards.wished,
      condition: 'played',
    });
    expect(second.statusCode).toBe(201);

    const res = await req('POST', `/scan/sessions/${id}/confirm`);
    expect(res.json().wishlist_matches).toHaveLength(1);
  });

  it('com auto-remoção ligada, o item sai da wishlist e o confirm avisa', async () => {
    await prisma.userProfile.update({
      where: { id: userId },
      data: { wishlistAutoRemove: true },
    });
    const list = await req('POST', '/wishlists', { name: `Desejos ${tok}` });
    await req('POST', `/wishlists/${list.json().id}/items`, { card_id: cards.wished });

    const id = await openSession();
    await readyCapture(id, cards.wished, NAME.wished);
    const res = await req('POST', `/scan/sessions/${id}/confirm`);

    expect(res.json().wishlist_auto_removed).toBe(true);
    expect(res.json().wishlist_matches[0].removed).toBe(true);

    const detail = await req('GET', `/wishlists/${list.json().id}`);
    expect(detail.json().items).toHaveLength(0);
  });
});
