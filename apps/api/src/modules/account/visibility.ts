import type { FastifyInstance } from 'fastify';
import type { CollectionVisibility, PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { notFound } from '../../lib/errors.js';
import { ensureProfile, generateShareToken } from './service.js';

/**
 * Visibilidade da coleção e link público compartilhável (T023, FR-003/003a/b/c).
 * Privada por padrão; o link usa um token opaco não adivinhável. Inclui um resolvedor
 * público mínimo (semente da US7) para validar que o link abre e que a revogação → 404.
 */

export interface VisibilityDeps {
  prisma: PrismaClient;
  shareLinkBaseUrl: string;
}

const putSchema = z
  .object({
    status: z.enum(['private', 'public_link']),
    show_cards: z.boolean(),
    show_values: z.boolean(),
    show_quantities: z.boolean(),
  })
  .partial();

const shareLinkSchema = z.object({
  action: z.enum(['generate', 'revoke']).default('generate'),
});

function serialize(v: CollectionVisibility, baseUrl: string) {
  const isPublic = v.status === 'public_link' && v.shareToken != null;
  return {
    status: v.status,
    show_cards: v.showCards,
    show_values: v.showValues,
    show_quantities: v.showQuantities,
    share_token: isPublic ? v.shareToken : null,
    share_url: isPublic ? `${baseUrl}${v.shareToken}` : null,
  };
}

export function registerVisibilityRoutes(app: FastifyInstance, deps: VisibilityDeps): void {
  const { prisma, shareLinkBaseUrl } = deps;

  app.get('/me/visibility', { preHandler: app.requireAuth }, async (req) => {
    await ensureProfile(prisma, req.user!);
    const v = await prisma.collectionVisibility.findUniqueOrThrow({
      where: { userId: req.user!.id },
    });
    return serialize(v, shareLinkBaseUrl);
  });

  app.put('/me/visibility', { preHandler: app.requireAuth }, async (req) => {
    await ensureProfile(prisma, req.user!);
    const body = putSchema.parse(req.body);
    const v = await prisma.collectionVisibility.update({
      where: { userId: req.user!.id },
      data: {
        status: body.status,
        showCards: body.show_cards,
        showValues: body.show_values,
        showQuantities: body.show_quantities,
      },
    });
    return serialize(v, shareLinkBaseUrl);
  });

  app.post('/me/visibility/share-link', { preHandler: app.requireAuth }, async (req) => {
    await ensureProfile(prisma, req.user!);
    const { action } = shareLinkSchema.parse(req.body ?? {});
    const data =
      action === 'generate'
        ? { status: 'public_link' as const, shareToken: generateShareToken() }
        : { status: 'private' as const, shareToken: null };
    const v = await prisma.collectionVisibility.update({
      where: { userId: req.user!.id },
      data,
    });
    return serialize(v, shareLinkBaseUrl);
  });

  // Resolvedor público (🔓, sem auth). 404 opaco quando o token não existe, foi revogado
  // ou a coleção não é pública (FR-003b/c, SC-012). Conteúdo da coleção chega na US2/US7.
  app.get('/public/collections/:shareToken', async (req) => {
    const { shareToken } = req.params as { shareToken: string };
    const v = await prisma.collectionVisibility.findFirst({
      where: { shareToken, status: 'public_link' },
      include: { user: { select: { displayName: true } } },
    });
    if (!v) throw notFound('coleção não encontrada');
    return {
      owner: { display_name: v.user.displayName },
      visibility: {
        show_cards: v.showCards,
        show_values: v.showValues,
        show_quantities: v.showQuantities,
      },
      collection: [] as unknown[], // itens entram na US2; visão pública completa na US7
    };
  });
}
