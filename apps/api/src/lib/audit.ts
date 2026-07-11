/**
 * Trilha de auditoria imutável de movimentações financeiras (FR-035, constituição IV).
 * A tabela `financial_audit_log` é append-only (UPDATE/DELETE revogados na migration).
 * Este módulo abstrai o destino (sink) para permitir teste sem banco.
 */

export type AuditActor = 'user' | 'system' | 'webhook';

export interface AuditEntry {
  orderId?: string;
  actor: AuditActor;
  /** Ex.: payment_captured, released, refunded, commission_withheld. */
  action: string;
  amountCents?: number;
  stateBefore?: string;
  stateAfter?: string;
  providerEventId?: string;
}

export interface AuditSink {
  write(entry: AuditEntry): Promise<void>;
}

/** Sink em memória para testes. */
export class InMemoryAuditSink implements AuditSink {
  readonly entries: AuditEntry[] = [];

  async write(entry: AuditEntry): Promise<void> {
    if (entry.amountCents !== undefined && !Number.isInteger(entry.amountCents)) {
      throw new Error(`amountCents deve ser inteiro em centavos, recebido: ${entry.amountCents}`);
    }
    this.entries.push({ ...entry });
  }
}

/** Forma mínima do client Prisma de que o sink depende (evita acoplar ao client gerado). */
export interface AuditCreateClient {
  financialAuditLog: {
    create(args: { data: Record<string, unknown> }): Promise<unknown>;
  };
}

/** Sink que persiste via Prisma. Use dentro da mesma transação da mudança de estado. */
export class PrismaAuditSink implements AuditSink {
  constructor(private readonly client: AuditCreateClient) {}

  async write(entry: AuditEntry): Promise<void> {
    if (entry.amountCents !== undefined && !Number.isInteger(entry.amountCents)) {
      throw new Error(`amountCents deve ser inteiro em centavos, recebido: ${entry.amountCents}`);
    }
    await this.client.financialAuditLog.create({
      data: {
        orderId: entry.orderId,
        actor: entry.actor,
        action: entry.action,
        amountCents: entry.amountCents,
        stateBefore: entry.stateBefore,
        stateAfter: entry.stateAfter,
        providerEventId: entry.providerEventId,
      },
    });
  }
}
