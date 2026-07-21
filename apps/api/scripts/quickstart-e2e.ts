/**
 * T038 — validação ponta-a-ponta do specs/002-custom-collections/quickstart.md (cenários 1–5).
 *
 * Sobe a API de verdade (HTTP real, porta 3999) contra o banco de DEV (:5434, catálogo carregado),
 * sob um usuário e2e dedicado e efêmero. O `authOverride` substitui só a verificação do JWT do
 * Supabase (indisponível fora do app); todo o resto — rotas, Prisma, valoração — é o código real.
 *
 * O usuário e2e é apagado no final; a cascata leva junto seus collection_item, pastas e vínculos.
 * Nenhum dado do usuário real é tocado.
 */
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/lib/config.js';
import type { AuthUser } from '../src/modules/auth/plugin.js';

const DEV_URL = process.env.DATABASE_URL ?? 'postgresql://poketche:poketche@localhost:5434/poketche';
const PORT = 3999;
const BASE = `http://127.0.0.1:${PORT}/api/v1`;

const userId = randomUUID();
// `content-type: application/json` só entra quando há corpo: o Fastify rejeita corpo vazio
// declarado como JSON (FST_ERR_CTP_EMPTY_JSON_BODY), o que quebraria todo DELETE.
const auth = { 'x-test-user-id': userId };

const prisma = new PrismaClient({ datasourceUrl: DEV_URL });

// ----------------------------------------------------------------- harness

interface Result {
  scenario: string;
  step: string;
  ok: boolean;
  detail: string;
}
const results: Result[] = [];
let currentScenario = '';

function scenario(name: string): void {
  currentScenario = name;
  console.log(`\n=== ${name} ===`);
}

function check(step: string, ok: boolean, detail = ''): boolean {
  results.push({ scenario: currentScenario, step, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FALHA'}  ${step}${detail ? ` — ${detail}` : ''}`);
  return ok;
}

const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const show = (v: unknown) => JSON.stringify(v);

async function api(
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = auth,
): Promise<{ status: number; json: any; headers: Headers }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body === undefined ? headers : { ...headers, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, json, headers: res.headers };
}

/** Rota de visitante: sem nenhum header de autenticação. */
const anon = (path: string) => api('GET', path, undefined, {});

// ----------------------------------------------------------------- fixture

async function setup() {
  // Cartas reais do catálogo: duas com cotação (variantes distintas) e uma sem nenhuma.
  const normalPrice = await prisma.cardPrice.findFirst({ where: { variant: 'normal', condition: null } });
  const holoPrice = await prisma.cardPrice.findFirst({ where: { variant: 'holo', condition: null } });
  if (!normalPrice || !holoPrice) throw new Error('catálogo sem cotações normal+holo — rode o job de preços');

  const pricedIds = (await prisma.cardPrice.findMany({ select: { cardId: true } })).map((p) => p.cardId);
  const unpricedCard = await prisma.card.findFirst({ where: { id: { notIn: pricedIds } } });
  if (!unpricedCard) throw new Error('catálogo sem carta sem cotação');

  await prisma.userProfile.create({ data: { id: userId, displayName: 'E2E Quickstart' } });

  const mk = (cardId: string, variant: 'normal' | 'holo', quantity: number) =>
    prisma.collectionItem.create({
      data: { userId, cardId, condition: 'near_mint', language: 'en', variant, quantity },
    });

  const itemA = await mk(normalPrice.cardId, 'normal', 2); // 2 × normalPrice
  const itemB = await mk(holoPrice.cardId, 'holo', 1); //     1 × holoPrice
  const itemC = await mk(unpricedCard.id, 'normal', 3); //    sem cotação

  return {
    itemA: itemA.id,
    itemB: itemB.id,
    itemC: itemC.id,
    cardA: normalPrice.cardId,
    priceA: normalPrice.priceCents,
    priceB: holoPrice.priceCents,
  };
}

// ----------------------------------------------------------------- cenários

async function cenario1(fx: Awaited<ReturnType<typeof setup>>) {
  scenario('Cenário 1 — CRUD (US1) e isolamento do inventário');

  const created = await api('POST', '/collections', { name: 'Favoritas' });
  check(
    '1. POST /collections → 201 com summary zerado',
    created.status === 201 &&
      eq(created.json.summary, {
        total_cents: 0,
        priced_items: 0,
        unpriced_items: 0,
        distinct_cards: 0,
        total_quantity: 0,
      }),
    `status=${created.status} summary=${show(created.json?.summary)}`,
  );
  const id = created.json.id;

  const hub = await api('GET', '/collections');
  const row = hub.json.collections.find((c: any) => c.id === id);
  check(
    '2. GET /collections → pasta com 0 cartas · 0 unidades · valor 0',
    !!row && row.summary.distinct_cards === 0 && row.summary.total_quantity === 0 && row.summary.total_cents === 0,
    `summary=${show(row?.summary)}`,
  );

  const renamed = await api('PATCH', `/collections/${id}`, { name: 'Top 10' });
  check(
    '3. PATCH /collections/:id → nome atualizado',
    renamed.status === 200 && renamed.json.name === 'Top 10',
    `name=${show(renamed.json?.name)}`,
  );

  const before = (await api('GET', '/collection')).json.summary;
  check('4. GET /collection → summary do inventário anotado', true, show(before));

  const del = await api('DELETE', `/collections/${id}`);
  check('5. DELETE /collections/:id → {deleted:true}', del.status === 200 && del.json.deleted === true, show(del.json));

  const after = (await api('GET', '/collection')).json.summary;
  check(
    '6. GET /collection → summary idêntico ao passo 4 (SC-003)',
    eq(before, after),
    `antes=${show(before)} depois=${show(after)}`,
  );
}

async function cenario2(fx: Awaited<ReturnType<typeof setup>>) {
  scenario('Cenário 2 — Vínculos muitos-para-muitos (US2)');

  const charizards = (await api('POST', '/collections', { name: 'Só Charizards' })).json.id;
  const favoritas = (await api('POST', '/collections', { name: 'Favoritas' })).json.id;
  check('1. duas pastas criadas', !!charizards && !!favoritas, `ids=${charizards}, ${favoritas}`);

  const inv = (await api('GET', '/collection')).json;
  const X = fx.itemA;
  check(
    '2. collection_item_id escolhido do inventário',
    inv.items.some((i: any) => i.id === X),
    `X=${X}`,
  );

  const invBefore = inv.summary;

  const l1 = await api('POST', `/collections/${charizards}/items`, { collection_item_id: X });
  check('3. POST vínculo em "Só Charizards" → 201', l1.status === 201, `status=${l1.status}`);

  const l2 = await api('POST', `/collections/${favoritas}/items`, { collection_item_id: X });
  check('4. POST mesmo item em "Favoritas" → 201', l2.status === 201, `status=${l2.status}`);

  const l3 = await api('POST', `/collections/${charizards}/items`, { collection_item_id: X });
  const charSlice = (await api('GET', `/collections/${charizards}`)).json;
  const dupes = charSlice.items.filter((i: any) => i.id === X).length;
  check(
    '5. POST repetido → 201 idempotente, sem duplicar',
    l3.status === 201 && dupes === 1,
    `status=${l3.status} ocorrências no recorte=${dupes}`,
  );

  const invAfter = (await api('GET', '/collection')).json;
  const occurrences = invAfter.items.filter((i: any) => i.id === X).length;
  check(
    '6. GET /collection → item X aparece 1× e summary não muda (SC-002)',
    occurrences === 1 && eq(invBefore, invAfter.summary),
    `ocorrências=${occurrences} antes=${show(invBefore)} depois=${show(invAfter.summary)}`,
  );

  await api('DELETE', `/collections/${charizards}/items/${X}`);
  const charAfter = (await api('GET', `/collections/${charizards}`)).json;
  const favAfter = (await api('GET', `/collections/${favoritas}`)).json;
  const invFinal = (await api('GET', '/collection')).json;
  check(
    '7. DELETE vínculo → some de Charizards, permanece em Favoritas e no inventário',
    !charAfter.items.some((i: any) => i.id === X) &&
      favAfter.items.some((i: any) => i.id === X) &&
      invFinal.items.some((i: any) => i.id === X),
    `charizards=${charAfter.items.length} favoritas=${favAfter.items.length} inventário tem X=${invFinal.items.some((i: any) => i.id === X)}`,
  );

  await api('DELETE', `/collections/${charizards}`);
  await api('DELETE', `/collections/${favoritas}`);
}

async function cenario3(fx: Awaited<ReturnType<typeof setup>>) {
  scenario('Cenário 3 — Recorte com estatísticas próprias (US3)');

  const id = (await api('POST', '/collections', { name: 'Recorte' })).json.id;
  await api('POST', `/collections/${id}/items`, { collection_item_id: fx.itemA }); // 2 × priceA
  await api('POST', `/collections/${id}/items`, { collection_item_id: fx.itemB }); // 1 × priceB

  const slice = (await api('GET', `/collections/${id}`)).json;
  // Cálculo manual, independente do código da API: Σ (preço atual × quantidade).
  const manual = fx.priceA * 2 + fx.priceB * 1;
  check(
    '2. summary.total_cents == Σ (preço × quantidade) calculado à mão (SC-004)',
    slice.summary.total_cents === manual,
    `api=${slice.summary.total_cents} manual=${manual} (${fx.priceA}×2 + ${fx.priceB}×1)`,
  );

  check(
    '3. distinct_cards e total_quantity (duas medidas)',
    slice.summary.distinct_cards === 2 && slice.summary.total_quantity === 3,
    `distinct_cards=${slice.summary.distinct_cards} (esperado 2) total_quantity=${slice.summary.total_quantity} (esperado 3)`,
  );

  const ovBefore = (await api('GET', '/stats/overview')).json;

  await api('POST', `/collections/${id}/items`, { collection_item_id: fx.itemC }); // sem preço
  const withUnpriced = (await api('GET', `/collections/${id}`)).json;
  check(
    '4. item sem preço entra em unpriced_items e fica fora do total_cents',
    withUnpriced.summary.unpriced_items === 1 && withUnpriced.summary.total_cents === manual,
    `unpriced_items=${withUnpriced.summary.unpriced_items} total_cents=${withUnpriced.summary.total_cents} (inalterado=${manual})`,
  );

  const ovAfter = (await api('GET', '/stats/overview')).json;
  check(
    '5. GET /stats/overview não muda com operações de pasta (SC-005)',
    eq(ovBefore, ovAfter),
    `antes.total_cents=${ovBefore.total_cents} depois.total_cents=${ovAfter.total_cents}`,
  );

  await api('PATCH', `/collection/items/${fx.itemA}`, {
    condition: 'near_mint',
    language: 'en',
    variant: 'normal',
    quantity: 5,
  });
  const afterQty = (await api('GET', `/collections/${id}`)).json;
  const manual5 = fx.priceA * 5 + fx.priceB * 1;
  check(
    '6. PATCH quantidade no inventário → recorte reflete o novo valor',
    afterQty.summary.total_cents === manual5 && afterQty.summary.total_quantity === 9,
    `total_cents=${afterQty.summary.total_cents} manual=${manual5} total_quantity=${afterQty.summary.total_quantity} (esperado 9)`,
  );

  // Restaura a quantidade para não contaminar os cenários seguintes.
  await api('PATCH', `/collection/items/${fx.itemA}`, {
    condition: 'near_mint',
    language: 'en',
    variant: 'normal',
    quantity: 2,
  });
  await api('DELETE', `/collections/${id}`);
}

async function cenario4(fx: Awaited<ReturnType<typeof setup>>) {
  scenario('Cenário 4 — Hub e listagem reusada (US4)');

  const a = (await api('POST', '/collections', { name: 'Hub A' })).json.id;
  const b = (await api('POST', '/collections', { name: 'Hub B' })).json.id;
  await api('POST', `/collections/${a}/items`, { collection_item_id: fx.itemA });
  await api('POST', `/collections/${a}/items`, { collection_item_id: fx.itemB });
  await api('POST', `/collections/${b}/items`, { collection_item_id: fx.itemC });

  const hub = (await api('GET', '/collections')).json;
  const rowA = hub.collections.find((c: any) => c.id === a);
  const rowB = hub.collections.find((c: any) => c.id === b);
  check(
    '1. GET /collections → pastas com nome, contagem (distinct·unidades) e valor',
    rowA?.name === 'Hub A' &&
      rowA.summary.distinct_cards === 2 &&
      rowA.summary.total_quantity === 3 &&
      rowA.summary.total_cents === fx.priceA * 2 + fx.priceB &&
      rowB?.summary.distinct_cards === 1 &&
      rowB.summary.total_cents === 0,
    `A=${show(rowA?.summary)} B=${show(rowB?.summary)}`,
  );

  // O recorte devolve os itens no MESMO shape da listagem do inventário (mesma função `serialize`):
  // comparação campo a campo do mesmo item nas duas rotas.
  const sliceItem = (await api('GET', `/collections/${a}`)).json.items.find((i: any) => i.id === fx.itemA);
  const invItem = (await api('GET', '/collection')).json.items.find((i: any) => i.id === fx.itemA);
  check(
    '3. item do recorte é idêntico ao da listagem do inventário (mesma apresentação)',
    eq(sliceItem, invItem),
    eq(sliceItem, invItem)
      ? `chaves=${Object.keys(sliceItem ?? {}).join(',')}`
      : `recorte=${show(sliceItem)} inventário=${show(invItem)}`,
  );

  await api('DELETE', `/collections/${a}`);
  await api('DELETE', `/collections/${b}`);
}

async function cenario5(fx: Awaited<ReturnType<typeof setup>>) {
  scenario('Cenário 5 — Compartilhamento por link (US5)');

  const id = (await api('POST', '/collections', { name: 'Pública' })).json.id;
  await api('POST', `/collections/${id}/items`, { collection_item_id: fx.itemA });
  const other = (await api('POST', '/collections', { name: 'Outra pasta' })).json.id;
  await api('POST', `/collections/${other}/items`, { collection_item_id: fx.itemB });

  const vis = await api('PUT', `/collections/${id}/visibility`, {
    show_cards: true,
    show_values: true,
    show_quantities: true,
  });
  check(
    '1. PUT /visibility com as três flags',
    vis.status === 200 && vis.json.show_cards && vis.json.show_values && vis.json.show_quantities,
    show({ cards: vis.json?.show_cards, values: vis.json?.show_values, qty: vis.json?.show_quantities }),
  );

  const link = await api('POST', `/collections/${id}/share-link`, { action: 'generate' });
  const token = link.json.share_token;
  check(
    '2. POST /share-link generate → share_url e share_token',
    link.status === 200 && !!token && !!link.json.share_url,
    `token=${token?.slice(0, 8)}… url=${link.json?.share_url}`,
  );

  const pub = await anon(`/public/custom-collections/${token}`);
  const pubItem = pub.json?.items?.[0];
  const leaks = pubItem ? Object.keys(pubItem).filter((k) => ['id', 'acquisition_price_cents', 'trend'].includes(k)) : [];
  check(
    '3a. GET público (sem auth) → 200 com só o recorte da pasta',
    pub.status === 200 && pub.json.items.length === 1 && pub.json.collection.name === 'Pública',
    `status=${pub.status} itens=${pub.json?.items?.length} nome=${show(pub.json?.collection?.name)}`,
  );
  check(
    '3b. respeita as flags (quantidade e valores visíveis)',
    pubItem?.quantity === 2 && pubItem?.price?.price_cents === fx.priceA && pub.json.summary != null,
    `quantity=${show(pubItem?.quantity)} price=${show(pubItem?.price?.price_cents)} summary=${pub.json?.summary ? 'presente' : 'null'}`,
  );
  check(
    '3c. sem acquisition_price, sem id de item, sem trend',
    leaks.length === 0,
    leaks.length ? `vazou: ${leaks.join(', ')}` : `chaves=${Object.keys(pubItem ?? {}).join(',')}`,
  );
  check(
    '3d. Cache-Control: no-store',
    pub.headers.get('cache-control') === 'no-store',
    `cache-control=${show(pub.headers.get('cache-control'))}`,
  );

  const otherItemIds = (await api('GET', `/collections/${other}`)).json.items.map((i: any) => i.card.id);
  const pubCardIds = pub.json.items.map((i: any) => i.card.id);
  check(
    '4. link não dá acesso ao inventário completo nem a outras pastas',
    pubCardIds.length === 1 && !pubCardIds.some((c: string) => otherItemIds.includes(c)),
    `cartas no link=${pubCardIds.length} (inventário tem 3 itens, outra pasta tem ${otherItemIds.length})`,
  );

  await api('POST', `/collections/${id}/share-link`, { action: 'revoke' });
  const revoked = await anon(`/public/custom-collections/${token}`);
  check(
    '5. revoke → token antigo vira 404 opaco',
    revoked.status === 404,
    `status=${revoked.status} body=${show(revoked.json)}`,
  );

  const relink = await api('POST', `/collections/${id}/share-link`, { action: 'generate' });
  const token2 = relink.json.share_token;
  const alive = await anon(`/public/custom-collections/${token2}`);
  await api('DELETE', `/collections/${id}`);
  const dead = await anon(`/public/custom-collections/${token2}`);
  check(
    '6. novo link funciona; após DELETE da pasta para de funcionar (SC-007)',
    alive.status === 200 && dead.status === 404,
    `antes do delete=${alive.status} depois=${dead.status}`,
  );

  await api('DELETE', `/collections/${other}`);
}

// ----------------------------------------------------------------- runner

async function main() {
  const config = loadConfig({ DATABASE_URL: DEV_URL, NODE_ENV: 'test' });
  const app = await buildApp(config, {
    prismaClient: prisma,
    authOverride: (req): AuthUser => {
      const id = req.headers['x-test-user-id'];
      if (typeof id !== 'string') throw new Error('sem usuário de teste');
      return { id, role: 'user', email: 'e2e@example.com' };
    },
  });
  await app.listen({ port: PORT, host: '127.0.0.1' });

  let fx: Awaited<ReturnType<typeof setup>> | null = null;
  try {
    fx = await setup();
    await cenario1(fx);
    await cenario2(fx);
    await cenario3(fx);
    await cenario4(fx);
    await cenario5(fx);
  } finally {
    // Cascata: apagar o perfil e2e leva collection_item, pastas e vínculos junto.
    await prisma.userProfile.deleteMany({ where: { id: userId } });
    await app.close();
    await prisma.$disconnect();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${'='.repeat(70)}`);
  for (const s of [...new Set(results.map((r) => r.scenario))]) {
    const rs = results.filter((r) => r.scenario === s);
    const bad = rs.filter((r) => !r.ok);
    console.log(`${bad.length === 0 ? 'PASSOU' : 'FALHOU'}  ${s}  (${rs.length - bad.length}/${rs.length})`);
    for (const b of bad) console.log(`         ↳ ${b.step} — ${b.detail}`);
  }
  console.log(`${'='.repeat(70)}`);
  console.log(`Total: ${results.length - failed.length}/${results.length} verificações passaram`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('ERRO FATAL:', err);
  process.exit(1);
});
