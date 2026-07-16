import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { ensureProfile } from './service.js';

/**
 * Registro do token de push do aparelho (T062, FR-046). O app chama a cada abertura: o token
 * do Expo pode ser rotacionado pelo sistema, e o `last_seen_at` permite futura limpeza de
 * aparelhos inativos.
 */

const bodySchema = z.object({
  expo_token: z.string().min(1),
  platform: z.enum(['ios', 'android']),
});

export function registerPushTokenRoutes(app: FastifyInstance, prisma: PrismaClient): void {
  app.post('/me/push-tokens', { preHandler: app.requireAuth }, async (req) => {
    const body = bodySchema.parse(req.body);
    await ensureProfile(prisma, req.user!);

    // O token é único por aparelho, não por usuário: se duas contas usam o mesmo telefone, o
    // token migra para quem logou por último — senão o push iria para o dono anterior.
    const token = await prisma.pushToken.upsert({
      where: { expoToken: body.expo_token },
      update: { userId: req.user!.id, platform: body.platform, lastSeenAt: new Date() },
      create: {
        userId: req.user!.id,
        expoToken: body.expo_token,
        platform: body.platform,
      },
    });

    return {
      id: token.id,
      expo_token: token.expoToken,
      platform: token.platform,
      last_seen_at: token.lastSeenAt,
    };
  });
}
