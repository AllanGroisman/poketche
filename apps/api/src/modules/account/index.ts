import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import type { PaymentProvider } from '../../integrations/payments/provider.js';
import { registerProfileRoutes } from './routes.js';
import { registerSellerRoutes } from './seller.js';
import { registerVisibilityRoutes } from './visibility.js';

export interface AccountDeps {
  prisma: PrismaClient;
  payments: PaymentProvider;
  shareLinkBaseUrl: string;
}

/** Módulo de conta (US1): perfil, visibilidade + link público, onboarding de vendedor. */
export function registerAccount(app: FastifyInstance, deps: AccountDeps): void {
  registerProfileRoutes(app, deps.prisma);
  registerVisibilityRoutes(app, { prisma: deps.prisma, shareLinkBaseUrl: deps.shareLinkBaseUrl });
  registerSellerRoutes(app, { prisma: deps.prisma, payments: deps.payments });
}

export { ensureProfile, generateShareToken } from './service.js';
