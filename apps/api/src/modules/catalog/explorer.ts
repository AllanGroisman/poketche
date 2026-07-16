import type { FastifyInstance } from 'fastify';
import { Prisma, type PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { notFound } from '../../lib/errors.js';
import { selectCardMarketPrice, serializePrice, type PriceLike } from '../pricing/current.js';
import {
  buildCardSeries,
  computeVariation,
  highLow,
  MAX_HISTORY_WINDOW_DAYS,
} from '../pricing/history.js';
import { catalogEtag, latestSync, serveCached } from './cache.js';
import { localize } from './localize.js';

/**
 * Explorador público do catálogo (T054, FR-068/FR-070, SC-020): edições → grade da edição →
 * detalhe da carta, tudo sem conta. São as rotas de maior tráfego do app: paginadas, com
 * `Cache-Control` + `ETag` (ver `cache.ts`).
 *
 * Regra estrutural (FR-072, contrato §Catálogo): **nenhum dado por usuário entra aqui**. Posse e
 * completude vivem em `completion.ts`, autenticadas e sem cache — senão a resposta cacheada de
 * um usuário serviria a outro.
 */

const langSchema = z.enum(['pt', 'en']).default('pt');

const gridSchema = z.object({
  lang: langSchema,
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(60).default(30),
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * `:id` de edição aceita o uuid e o external_id ("base1", "sv1"): o external é o identificador
 * estável e legível que o catálogo já usa no filtro `?set=` da busca.
 */
export function setWhere(id: string): Prisma.CardSetWhereInput {
  return UUID_RE.test(id) ? { id } : { externalId: id };
}

/**
 * Ordem da grade (FR-068): número da carta é `text` no provedor ("2", "10", "SV49", "TG12"),
 * então a ordenação lexicográfica colocaria "10" antes de "2". Ordena pelo prefixo numérico e
 * usa o texto como desempate (promos e subséries sem número puro caem no fim, juntas).
 */
const NUMBER_ORDER = Prisma.sql`
  NULLIF(regexp_replace(c.number, '\\D', '', 'g'), '')::int NULLS LAST, c.number
`;

export function registerCatalogExplorer(app: FastifyInstance, prisma: PrismaClient): void {
  // 🔓 Lista de edições: logo, data de lançamento e total de cartas (FR-068).
  app.get('/catalog/sets', async (req, reply) => {
    const sets = await prisma.cardSet.findMany({
      orderBy: [{ releaseDate: 'desc' }, { name: 'asc' }],
      select: {
        id: true,
        externalId: true,
        name: true,
        series: true,
        releaseDate: true,
        totalCards: true,
        logoUrl: true,
        syncedAt: true,
      },
    });

    if (serveCached(req, reply, catalogEtag('sets', sets.length, latestSync(sets)))) return;

    return {
      sets: sets.map((s) => ({
        id: s.id,
        external_id: s.externalId,
        name: s.name,
        series: s.series,
        release_date: s.releaseDate,
        total_cards: s.totalCards,
        logo_url: s.logoUrl,
      })),
    };
  });

  // 🔓 Grade da edição, paginada (FR-068). Thumbnails no idioma pedido, fallback EN (FR-011).
  app.get('/catalog/sets/:id/cards', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { lang, page, limit } = gridSchema.parse(req.query);

    const set = await prisma.cardSet.findFirst({
      where: setWhere(id),
      select: { id: true, externalId: true, name: true, totalCards: true, syncedAt: true },
    });
    if (!set) throw notFound('edição não encontrada');

    const total = await prisma.card.count({ where: { setId: set.id } });
    const offset = (page - 1) * limit;

    // Ordenação numérica exige SQL: o Prisma não expressa a expressão do prefixo.
    const ordered = await prisma.$queryRaw<{ id: string }[]>`
      SELECT c.id FROM card c
      WHERE c.set_id = ${set.id}::uuid
      ORDER BY ${NUMBER_ORDER}
      LIMIT ${limit} OFFSET ${offset}
    `;
    const ids = ordered.map((r) => r.id);

    const cards = ids.length
      ? await prisma.card.findMany({
          where: { id: { in: ids } },
          include: { translations: { select: { id: true, language: true, name: true } } },
        })
      : [];
    const byId = new Map(cards.map((c) => [c.id, c]));

    const etag = catalogEtag('grid', set.id, lang, page, limit, total, latestSync(cards));
    if (serveCached(req, reply, etag)) return;

    return {
      set: {
        id: set.id,
        external_id: set.externalId,
        name: set.name,
        total_cards: set.totalCards,
      },
      page,
      limit,
      total,
      has_more: offset + ids.length < total,
      cards: ids
        .map((cardId) => byId.get(cardId))
        .filter((c): c is NonNullable<typeof c> => c != null)
        .map((c) => ({
          id: c.id,
          external_id: c.externalId,
          number: c.number,
          rarity: c.rarity,
          supertype: c.supertype,
          types: c.types,
          ...localize(c.translations, lang),
        })),
    };
  });

  // 🔓 Detalhe da carta sem exigir posse ou conta (FR-070): imagem em alta, dados, preço de
  // mercado com fonte/data e resumo do histórico. O gráfico vem de `/price-history`.
  app.get('/catalog/cards/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const lang = langSchema.parse((req.query as { lang?: string }).lang);

    const card = await prisma.card.findUnique({
      where: { id },
      include: {
        set: {
          select: {
            id: true,
            externalId: true,
            name: true,
            releaseDate: true,
            totalCards: true,
            logoUrl: true,
          },
        },
        translations: { select: { id: true, language: true, name: true, syncedAt: true } },
      },
    });
    if (!card) throw notFound('carta não encontrada');

    const prices: PriceLike[] = await prisma.cardPrice.findMany({ where: { cardId: id } });
    const market = selectCardMarketPrice(prices);

    const since = new Date(Date.now() - MAX_HISTORY_WINDOW_DAYS * 86_400_000);
    const snapshots = await prisma.cardPriceSnapshot.findMany({
      where: { cardId: id, fetchedAt: { gte: since } },
      select: { condition: true, variant: true, priceCents: true, source: true, fetchedAt: true },
    });
    const { points } = buildCardSeries(snapshots);
    const currentCents = market?.priceCents ?? points.at(-1)?.priceCents ?? null;

    // O ETag do detalhe não pode olhar só o sync: preço e snapshots vêm de outro job
    // (price-refresh) e mudariam o corpo sem mexer em `synced_at`.
    const etag = catalogEtag(
      'card',
      card.id,
      lang,
      card.syncedAt,
      latestSync(card.translations),
      market?.fetchedAt ?? null,
      snapshots.length,
    );
    if (serveCached(req, reply, etag)) return;

    return {
      id: card.id,
      external_id: card.externalId,
      number: card.number,
      rarity: card.rarity,
      supertype: card.supertype,
      subtypes: card.subtypes,
      types: card.types,
      set: {
        id: card.set.id,
        external_id: card.set.externalId,
        name: card.set.name,
        release_date: card.set.releaseDate,
        total_cards: card.set.totalCards,
        logo_url: card.set.logoUrl,
      },
      ...localize(card.translations, lang),
      // Sem contexto de item, o preço só faz sentido com a condição/variante a que se refere.
      market_price: market
        ? { ...serializePrice(market)!, condition: market.condition, variant: market.variant }
        : null,
      // Resumo honesto (FR-042/FR-043): < 2 pontos → "histórico indisponível"; sem referência
      // em ou antes do corte, a variação fica null em vez de interpolada.
      history_available: points.length >= 2,
      change_30d: computeVariation(points, currentCents, 30),
      high_low: highLow(points),
    };
  });
}
