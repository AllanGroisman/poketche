import { describe, it, expect, vi } from 'vitest';
import { InMemoryAuditSink, PrismaAuditSink } from './audit.js';

describe('InMemoryAuditSink', () => {
  it('registra a entrada de auditoria', async () => {
    const sink = new InMemoryAuditSink();
    await sink.write({
      orderId: 'o1',
      actor: 'system',
      action: 'released',
      amountCents: 11000,
      stateBefore: 'shipped',
      stateAfter: 'released',
    });
    expect(sink.entries).toHaveLength(1);
    expect(sink.entries[0]).toMatchObject({ action: 'released', amountCents: 11000 });
  });

  it('rejeita amountCents não inteiro', async () => {
    const sink = new InMemoryAuditSink();
    await expect(sink.write({ actor: 'system', action: 'x', amountCents: 10.5 })).rejects.toThrow();
  });
});

describe('PrismaAuditSink', () => {
  it('chama financialAuditLog.create com os campos mapeados', async () => {
    const create = vi.fn(async (_args: { data: Record<string, unknown> }) => ({}));
    const sink = new PrismaAuditSink({ financialAuditLog: { create } });

    await sink.write({
      orderId: 'o2',
      actor: 'webhook',
      action: 'payment_captured',
      amountCents: 12000,
      stateBefore: 'pending_payment',
      stateAfter: 'paid',
      providerEventId: 'evt_1',
    });

    expect(create).toHaveBeenCalledTimes(1);
    const data = create.mock.calls[0]?.[0]?.data;
    expect(data).toMatchObject({
      orderId: 'o2',
      actor: 'webhook',
      action: 'payment_captured',
      amountCents: 12000,
      stateAfter: 'paid',
      providerEventId: 'evt_1',
    });
  });
});
