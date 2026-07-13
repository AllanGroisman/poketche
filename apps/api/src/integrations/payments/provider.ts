import { randomUUID } from 'node:crypto';

/**
 * Contrato do provedor de pagamentos (constituição V — isolamento; IV — dinheiro nunca
 * processado por nós). Na US1 só usamos `createRecipient` para iniciar o onboarding de
 * vendedor (KYC delegado ao provedor). O adapter real (Pagar.me) chega na US6 após o
 * spike de custódia (T076); aqui um stub permite exercitar o fluxo sem credenciais.
 */

export type KycStatus = 'pending' | 'approved' | 'rejected';

export interface CreateRecipientInput {
  userId: string;
  email?: string;
  displayName: string;
}

export interface RecipientResult {
  recipientId: string;
  kycStatus: KycStatus;
  /** URL de continuação do KYC no provedor (quando aplicável). */
  onboardingUrl?: string;
}

export interface PaymentProvider {
  createRecipient(input: CreateRecipientInput): Promise<RecipientResult>;
}

/** Stub determinístico p/ dev/testes: cria um recipient fictício em `pending`. */
export class StubPaymentProvider implements PaymentProvider {
  async createRecipient(input: CreateRecipientInput): Promise<RecipientResult> {
    return {
      recipientId: `stub_rp_${randomUUID()}`,
      kycStatus: 'pending',
      onboardingUrl: `https://sandbox.example/kyc/${encodeURIComponent(input.userId)}`,
    };
  }
}
