import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { ensureProfile } from './service.js';

/**
 * Perfil e preferências do usuário autenticado (T022). O perfil é provisionado
 * preguiçosamente a partir da identidade do Supabase (ensureProfile).
 */

const patchSchema = z
  .object({
    displayName: z.string().min(1).max(60),
    notificationsEnabled: z.boolean(),
    wishlistAutoRemove: z.boolean(),
    scannerSoundsEnabled: z.boolean(),
    preferredCamera: z.enum(['back', 'front']),
  })
  .partial();

function serialize(p: {
  id: string;
  displayName: string;
  notificationsEnabled: boolean;
  wishlistAutoRemove: boolean;
  scannerSoundsEnabled: boolean;
  preferredCamera: string;
  buyerRatingAvg: unknown;
  buyerRatingCount: number;
}) {
  return {
    id: p.id,
    display_name: p.displayName,
    notifications_enabled: p.notificationsEnabled,
    wishlist_auto_remove: p.wishlistAutoRemove,
    scanner_sounds_enabled: p.scannerSoundsEnabled,
    preferred_camera: p.preferredCamera,
    buyer_rating_avg: Number(p.buyerRatingAvg),
    buyer_rating_count: p.buyerRatingCount,
  };
}

export function registerProfileRoutes(app: FastifyInstance, prisma: PrismaClient): void {
  app.get('/me', { preHandler: app.requireAuth }, async (req) => {
    await ensureProfile(prisma, req.user!);
    const profile = await prisma.userProfile.findUniqueOrThrow({ where: { id: req.user!.id } });
    return serialize(profile);
  });

  app.patch('/me', { preHandler: app.requireAuth }, async (req) => {
    await ensureProfile(prisma, req.user!);
    const body = patchSchema.parse(req.body);
    const profile = await prisma.userProfile.update({
      where: { id: req.user!.id },
      data: body,
    });
    return serialize(profile);
  });
}
