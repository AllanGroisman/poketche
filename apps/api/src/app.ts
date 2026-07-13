import Fastify, { type FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import type { AppConfig } from './lib/config.js';
import { registerErrorHandler } from './lib/errors.js';
import { registerAuth, type AuthVerifier } from './modules/auth/plugin.js';
import { registerCatalogImages } from './modules/catalog/images.js';
import { registerAccount } from './modules/account/index.js';
import { createImageStore } from './integrations/storage/r2.js';
import { StubPaymentProvider } from './integrations/payments/provider.js';
import { prisma as defaultPrisma } from './lib/prisma.js';

/** Seams de injeção para testes de integração (Prisma de teste, auth simulada). */
export interface BuildAppOptions {
  prismaClient?: PrismaClient;
  authOverride?: AuthVerifier;
}

/**
 * Monta a instância Fastify com error handler padrão, auth e rota de health.
 * Os módulos de domínio (catalog, collection, marketplace, admin...) são registrados
 * aqui à medida que as user stories são implementadas.
 */
export async function buildApp(
  config: AppConfig,
  opts: BuildAppOptions = {},
): Promise<FastifyInstance> {
  const prisma = opts.prismaClient ?? defaultPrisma;
  const app = Fastify({
    logger: { level: config.NODE_ENV === 'development' ? 'info' : 'warn' },
  });

  registerErrorHandler(app);
  await registerAuth(app, config, opts.authOverride);

  app.get('/health', async () => ({ status: 'ok', service: 'poketche-api' }));

  // Proxy de imagens do catálogo com cache R2 (T018) — público, sob /api/v1.
  const imageStore = createImageStore(config);
  const payments = new StubPaymentProvider();
  await app.register(
    async (scope) => {
      await registerCatalogImages(scope, { prisma, store: imageStore });
      registerAccount(scope, {
        prisma,
        payments,
        shareLinkBaseUrl: config.SHARE_LINK_BASE_URL,
      });
    },
    { prefix: '/api/v1' },
  );

  // await app.register(collectionModule, { prefix: '/api/v1' }); // US2
  // ... demais módulos por fase.

  return app;
}
