import type { FastifyInstance } from 'fastify';
import type { Collection, PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { generateShareToken } from '../account/service.js';
import { ownedCollection } from './routes.js';

/**
 * Compartilhamento público por coleção personalizada (feature 002 — US5/FR-019/020/021).
 * Espelha a US7 (`account/visibility.ts` + `collection/public.ts`): flags de exibição + token
 * opaco não adivinhável, opt-in por pasta. O resolvedor público do link vive em `public.ts`.
 */

export interface ShareDeps {
  prisma: PrismaClient;
  shareLinkBaseUrl: string;
}

const flagsSchema = z
  .object({
    show_cards: z.boolean(),
    show_values: z.boolean(),
    show_quantities: z.boolean(),
  })
  .partial();

const shareLinkSchema = z.object({ action: z.enum(['generate', 'revoke']).default('generate') });

function serialize(c: Collection, baseUrl: string) {
  const isPublic = c.status === 'public_link' && c.shareToken != null;
  return {
    status: c.status,
    show_cards: c.showCards,
    show_values: c.showValues,
    show_quantities: c.showQuantities,
    share_token: isPublic ? c.shareToken : null,
    share_url: isPublic ? `${baseUrl}custom-collections/${c.shareToken}` : null,
  };
}

export function registerCustomCollectionShare(app: FastifyInstance, deps: ShareDeps): void {
  const { prisma, shareLinkBaseUrl } = deps;

  app.get('/collections/:id/visibility', { preHandler: app.requireAuth }, async (req) => {
    const { id } = req.params as { id: string };
    await ownedCollection(prisma, id, req.user!.id);
    const collection = await prisma.collection.findUniqueOrThrow({ where: { id } });
    return serialize(collection, shareLinkBaseUrl);
  });

  app.put('/collections/:id/visibility', { preHandler: app.requireAuth }, async (req) => {
    const { id } = req.params as { id: string };
    await ownedCollection(prisma, id, req.user!.id);
    const body = flagsSchema.parse(req.body);
    const collection = await prisma.collection.update({
      where: { id },
      data: {
        showCards: body.show_cards,
        showValues: body.show_values,
        showQuantities: body.show_quantities,
      },
    });
    return serialize(collection, shareLinkBaseUrl);
  });

  app.post('/collections/:id/share-link', { preHandler: app.requireAuth }, async (req) => {
    const { id } = req.params as { id: string };
    await ownedCollection(prisma, id, req.user!.id);
    const { action } = shareLinkSchema.parse(req.body ?? {});
    const data =
      action === 'generate'
        ? { status: 'public_link' as const, shareToken: generateShareToken() }
        : { status: 'private' as const, shareToken: null };
    const collection = await prisma.collection.update({ where: { id }, data });
    return serialize(collection, shareLinkBaseUrl);
  });
}
