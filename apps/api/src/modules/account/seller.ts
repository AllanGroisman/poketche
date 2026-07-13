import type { FastifyInstance } from 'fastify';
import type { PrismaClient, SellerProfile } from '@prisma/client';
import { notFound } from '../../lib/errors.js';
import type { PaymentProvider } from '../../integrations/payments/provider.js';
import { ensureProfile } from './service.js';

/**
 * Onboarding de vendedor (T024, FR-004): inicia o cadastro no provedor de pagamentos
 * (KYC delegado — constituição IV) e guarda apenas o status. O adapter real (Pagar.me)
 * chega na US6; aqui usamos o `PaymentProvider` (stub) sem persistir dados sensíveis.
 */

export interface SellerDeps {
  prisma: PrismaClient;
  payments: PaymentProvider;
}

function serialize(s: SellerProfile) {
  return {
    kyc_status: s.kycStatus,
    provider_recipient_id: s.providerRecipientId,
    rating_avg: Number(s.ratingAvg),
    rating_count: s.ratingCount,
  };
}

export function registerSellerRoutes(app: FastifyInstance, deps: SellerDeps): void {
  const { prisma, payments } = deps;

  app.get('/me/seller', { preHandler: app.requireAuth }, async (req) => {
    const seller = await prisma.sellerProfile.findUnique({ where: { userId: req.user!.id } });
    if (!seller) throw notFound('onboarding de vendedor não iniciado');
    return serialize(seller);
  });

  app.post('/me/seller', { preHandler: app.requireAuth }, async (req) => {
    await ensureProfile(prisma, req.user!);
    const existing = await prisma.sellerProfile.findUnique({ where: { userId: req.user!.id } });
    if (existing) return serialize(existing);

    const profile = await prisma.userProfile.findUniqueOrThrow({ where: { id: req.user!.id } });
    const recipient = await payments.createRecipient({
      userId: req.user!.id,
      email: req.user!.email,
      displayName: profile.displayName,
    });
    const seller = await prisma.sellerProfile.create({
      data: {
        userId: req.user!.id,
        providerRecipientId: recipient.recipientId,
        kycStatus: recipient.kycStatus,
      },
    });
    return { ...serialize(seller), onboarding_url: recipient.onboardingUrl };
  });
}
