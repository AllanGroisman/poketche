import Fastify, { type FastifyInstance } from 'fastify';
import type { AppConfig } from './lib/config.js';
import { registerErrorHandler } from './lib/errors.js';
import { registerAuth } from './modules/auth/plugin.js';
import { registerCatalogImages } from './modules/catalog/images.js';
import { createImageStore } from './integrations/storage/r2.js';
import { prisma } from './lib/prisma.js';

/**
 * Monta a instância Fastify com error handler padrão, auth e rota de health.
 * Os módulos de domínio (catalog, collection, marketplace, admin...) são registrados
 * aqui à medida que as user stories são implementadas.
 */
export async function buildApp(config: AppConfig): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: config.NODE_ENV === 'development' ? 'info' : 'warn' },
  });

  registerErrorHandler(app);
  await registerAuth(app, config);

  app.get('/health', async () => ({ status: 'ok', service: 'poketche-api' }));

  // Proxy de imagens do catálogo com cache R2 (T018) — público, sob /api/v1.
  const imageStore = createImageStore(config);
  await app.register(
    async (scope) => {
      await registerCatalogImages(scope, { prisma, store: imageStore });
    },
    { prefix: '/api/v1' },
  );

  // await app.register(collectionModule, { prefix: '/api/v1' }); // US2
  // ... demais módulos por fase.

  return app;
}
