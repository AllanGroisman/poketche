import Fastify, { type FastifyInstance } from 'fastify';
import type { AppConfig } from './lib/config.js';
import { registerErrorHandler } from './lib/errors.js';
import { registerAuth } from './modules/auth/plugin.js';

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

  // await app.register(catalogModule, { prefix: '/api/v1' });   // US2/US10
  // await app.register(collectionModule, { prefix: '/api/v1' }); // US2
  // ... demais módulos por fase.

  return app;
}
