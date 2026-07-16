import type { FastifyInstance } from 'fastify';
import { Prisma, type PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { badRequest } from '../../lib/errors.js';
import { localize } from './localize.js';

/**
 * Busca única do catálogo (T029/T055, FR-011/FR-069, SC-003/SC-021): serve tanto o autocomplete
 * do registro quanto o explorador. Usa pg_trgm (índice GIN em card_translation.name) para
 * ranquear por similaridade sobre os nomes de **todos** os idiomas e devolve a exibição
 * localizada (fallback EN).
 *
 * Três decisões que valem registrar:
 *   - **Filtros dentro do SQL**, não depois: filtrar o resultado já ranqueado encolheria a
 *     página (pedir 20 e receber 3) e esconderia cartas válidas fora do top-N.
 *   - **`q` é opcional**: o explorador navega só com filtros (edição/raridade/tipo/preço). Sem
 *     `q` não há relevância, então a ordem é a do catálogo (lançamento → número).
 *   - **Filtro de preço exclui cartas sem cotação** (FR-069) — e o payload diz quantas ficaram
 *     de fora, senão a lista mentiria por omissão.
 */

const querySchema = z
  .object({
    q: z.string().trim().min(1).max(60).optional(),
    set: z.string().trim().min(1).optional(),
    rarity: z.string().trim().min(1).optional(),
    type: z.string().trim().min(1).optional(),
    price_min: z.coerce.number().int().min(0).optional(),
    price_max: z.coerce.number().int().min(0).optional(),
    lang: z.enum(['pt', 'en']).default('pt'),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .refine((v) => v.price_min == null || v.price_max == null || v.price_min <= v.price_max, {
    message: 'price_min não pode ser maior que price_max',
  });

type Query = z.infer<typeof querySchema>;

/** Predicados combináveis (FR-069) — todos aplicados na mesma consulta que ordena. */
function filters(q: Query): Prisma.Sql[] {
  const where: Prisma.Sql[] = [];
  if (q.set) where.push(Prisma.sql`s.external_id = ${q.set}`);
  if (q.rarity) where.push(Prisma.sql`c.rarity = ${q.rarity}`);
  if (q.type) where.push(Prisma.sql`${q.type} = ANY(c.types)`);
  if (q.q) {
    where.push(Prisma.sql`EXISTS (
      SELECT 1 FROM card_translation ct
      WHERE ct.card_id = c.id AND (ct.name ILIKE ${`%${q.q}%`} OR ct.name % ${q.q})
    )`);
  }
  if (q.price_min != null || q.price_max != null) {
    where.push(Prisma.sql`EXISTS (
      SELECT 1 FROM card_price p
      WHERE p.card_id = c.id
        AND p.price_cents >= ${q.price_min ?? 0}
        AND p.price_cents <= ${q.price_max ?? Number.MAX_SAFE_INTEGER}
    )`);
  }
  return where;
}

const whereClause = (parts: Prisma.Sql[]) =>
  parts.length ? Prisma.sql`WHERE ${Prisma.join(parts, ' AND ')}` : Prisma.empty;

export function registerCatalogSearch(app: FastifyInstance, prisma: PrismaClient): void {
  app.get('/catalog/cards', async (req, reply) => {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? 'busca inválida');
    const query = parsed.data;
    const { lang, page, limit } = query;
    const offset = (page - 1) * limit;

    const where = whereClause(filters(query));
    const [{ count }] = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*)::bigint AS count
      FROM card c JOIN card_set s ON s.id = c.set_id
      ${where}
    `;
    const total = Number(count);

    // Com `q`, ordena por relevância (melhor similaridade entre as traduções da carta); sem
    // `q`, pela ordem natural do catálogo. O LEFT JOIN LATERAL calcula o rank uma vez por carta.
    const ranking = query.q
      ? Prisma.sql`
          LEFT JOIN LATERAL (
            SELECT MAX(similarity(ct.name, ${query.q})) AS rank
            FROM card_translation ct WHERE ct.card_id = c.id
          ) r ON true`
      : Prisma.empty;
    const order = query.q
      ? Prisma.sql`ORDER BY r.rank DESC NULLS LAST, c.number`
      : Prisma.sql`ORDER BY s.release_date DESC NULLS LAST,
          NULLIF(regexp_replace(c.number, '\\D', '', 'g'), '')::int NULLS LAST, c.number`;

    const ranked = await prisma.$queryRaw<{ id: string }[]>`
      SELECT c.id
      FROM card c JOIN card_set s ON s.id = c.set_id
      ${ranking}
      ${where}
      ${order}
      LIMIT ${limit} OFFSET ${offset}
    `;
    const ids = ranked.map((r) => r.id);

    // Quantas cartas o filtro de preço deixou de fora (FR-069): mesma consulta sem o predicado
    // de preço. Só custa quando o filtro está ativo.
    const pricedFilterActive = query.price_min != null || query.price_max != null;
    let unpricedExcluded = 0;
    if (pricedFilterActive) {
      const withoutPrice = whereClause([
        ...filters({ ...query, price_min: undefined, price_max: undefined }),
        Prisma.sql`NOT EXISTS (SELECT 1 FROM card_price p WHERE p.card_id = c.id)`,
      ]);
      const [row] = await prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*)::bigint AS count
        FROM card c JOIN card_set s ON s.id = c.set_id
        ${withoutPrice}
      `;
      unpricedExcluded = Number(row.count);
    }

    const cards = ids.length
      ? await prisma.card.findMany({
          where: { id: { in: ids } },
          include: {
            set: { select: { externalId: true, name: true } },
            translations: { select: { id: true, language: true, name: true } },
          },
        })
      : [];
    // Preserva a ordem definida pelo SQL (relevância ou catálogo).
    const byId = new Map(cards.map((c) => [c.id, c]));

    void reply.header('Cache-Control', 'public, max-age=300');

    return {
      page,
      limit,
      total,
      has_more: offset + ids.length < total,
      /** Cartas fora do resultado por não terem cotação, com o filtro de preço ativo (FR-069). */
      unpriced_excluded: unpricedExcluded,
      results: ids
        .map((id) => byId.get(id))
        .filter((c): c is NonNullable<typeof c> => c != null)
        .map((c) => ({
          id: c.id,
          external_id: c.externalId,
          number: c.number,
          rarity: c.rarity,
          supertype: c.supertype,
          types: c.types,
          set: { external_id: c.set.externalId, name: c.set.name },
          ...localize(c.translations, lang),
        })),
    };
  });
}
