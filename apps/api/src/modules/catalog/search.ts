import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { localize } from './localize.js';

/**
 * Busca única multilíngue do catálogo (T029, FR-011, SC-003). Usa pg_trgm (índice GIN
 * em card_translation.name) para autocomplete sub-1s: ranqueia por similaridade sobre
 * nomes de todos os idiomas e devolve a exibição localizada (fallback EN). Filtros
 * completos (raridade/tipo/preço) entram na US10; aqui: q, set, lang, limit.
 */

const querySchema = z.object({
  q: z.string().trim().min(1).max(60),
  set: z.string().optional(),
  lang: z.enum(['pt', 'en']).default('pt'),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export function registerCatalogSearch(app: FastifyInstance, prisma: PrismaClient): void {
  app.get('/catalog/cards', async (req) => {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) return { results: [] };
    const { q, set, lang, limit } = parsed.data;

    // Ranqueia cartas por melhor similaridade entre suas traduções (EN+PT).
    const ranked = await prisma.$queryRaw<{ card_id: string }[]>`
      SELECT ct.card_id
      FROM card_translation ct
      WHERE ct.name ILIKE ${'%' + q + '%'} OR ct.name % ${q}
      GROUP BY ct.card_id
      ORDER BY MAX(similarity(ct.name, ${q})) DESC
      LIMIT ${limit}
    `;
    const ids = ranked.map((r) => r.card_id);
    if (ids.length === 0) return { results: [] };

    const cards = await prisma.card.findMany({
      where: { id: { in: ids }, ...(set ? { set: { externalId: set } } : {}) },
      include: {
        set: { select: { externalId: true, name: true } },
        translations: { select: { id: true, language: true, name: true } },
      },
    });
    // Preserva a ordem de relevância do ranking.
    const byId = new Map(cards.map((c) => [c.id, c]));

    const results = ids
      .map((id) => byId.get(id))
      .filter((c): c is NonNullable<typeof c> => c != null)
      .map((c) => {
        const display = localize(c.translations, lang);
        return {
          id: c.id,
          external_id: c.externalId,
          number: c.number,
          rarity: c.rarity,
          supertype: c.supertype,
          types: c.types,
          set: { external_id: c.set.externalId, name: c.set.name },
          ...display,
        };
      });

    return { results };
  });
}
