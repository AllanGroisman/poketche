import Fastify, { type FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import type { AppConfig } from './lib/config.js';
import { registerErrorHandler } from './lib/errors.js';
import { registerAuth, type AuthVerifier } from './modules/auth/plugin.js';
import { registerCatalogImages } from './modules/catalog/images.js';
import { registerCatalogSearch } from './modules/catalog/search.js';
import { registerCatalogPriceHistory } from './modules/catalog/price-history.js';
import { registerCatalogExplorer } from './modules/catalog/explorer.js';
import { registerCatalogCompletion } from './modules/catalog/completion.js';
import { registerCollection } from './modules/collection/routes.js';
import { registerCollectionDetails } from './modules/collection/details.js';
import { registerCollectionPublic } from './modules/collection/public.js';
import { registerStats } from './modules/stats/routes.js';
import { registerWishlists } from './modules/wishlist/routes.js';
import { registerAccount } from './modules/account/index.js';
import { registerScanner } from './modules/scanner/index.js';
import { createImageStore } from './integrations/storage/r2.js';
import { createCardIdentifier, type CardIdentifier } from './integrations/identifier/index.js';
import { StubPaymentProvider } from './integrations/payments/provider.js';
import { prisma as defaultPrisma } from './lib/prisma.js';

/** Seams de injeção para testes de integração (Prisma de teste, auth simulada). */
export interface BuildAppOptions {
  prismaClient?: PrismaClient;
  authOverride?: AuthVerifier;
  /** Testes injetam o `StubCardIdentifier` para controlar o que cada captura identifica. */
  identifier?: CardIdentifier;
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
    // O crop do scanner viaja em base64 dentro do JSON (~4/3 do binário, mais o envelope), e o
    // default de 1MB do Fastify rejeitaria antes de a rota poder responder o 400 explicativo.
    // A validação de tamanho de verdade é por rota, contra SCANNER_MAX_CROP_KB.
    bodyLimit: Math.ceil(config.SCANNER_MAX_CROP_KB * 1024 * 1.4) + 64 * 1024,
  });

  registerErrorHandler(app);
  await registerAuth(app, config, opts.authOverride);

  app.get('/health', async () => ({ status: 'ok', service: 'poketche-api' }));

  // Proxy de imagens do catálogo com cache R2 (T018) — público, sob /api/v1.
  const imageStore = createImageStore(config);
  const payments = new StubPaymentProvider();
  const identifier = opts.identifier ?? createCardIdentifier(config, prisma, app.log);
  await app.register(
    async (scope) => {
      await registerCatalogImages(scope, { prisma, store: imageStore });
      registerCatalogSearch(scope, prisma);
      registerCatalogPriceHistory(scope, prisma);
      registerCatalogExplorer(scope, prisma);
      registerCatalogCompletion(scope, prisma);
      registerCollection(scope, prisma);
      registerCollectionDetails(scope, prisma);
      registerCollectionPublic(scope, prisma);
      registerStats(scope, prisma);
      registerWishlists(scope, prisma);
      registerAccount(scope, {
        prisma,
        payments,
        shareLinkBaseUrl: config.SHARE_LINK_BASE_URL,
      });
      registerScanner(scope, { prisma, identifier, maxCropKb: config.SCANNER_MAX_CROP_KB });
    },
    { prefix: '/api/v1' },
  );

  // await app.register(collectionModule, { prefix: '/api/v1' }); // US2
  // ... demais módulos por fase.

  return app;
}
