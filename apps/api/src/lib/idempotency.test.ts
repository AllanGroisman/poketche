import { describe, it, expect, vi } from 'vitest';
import { IdempotencyRunner, InMemoryIdempotencyStore } from './idempotency.js';

describe('IdempotencyRunner', () => {
  it('executa a função uma vez e reusa o resultado em reexecuções', async () => {
    const runner = new IdempotencyRunner(new InMemoryIdempotencyStore());
    const fn = vi.fn(async () => ({ orderId: 'o1' }));

    const first = await runner.run('key-1', fn);
    const second = await runner.run('key-1', fn);

    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(second.value).toEqual({ orderId: 'o1' });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('deduplica chamadas concorrentes com a mesma chave', async () => {
    const runner = new IdempotencyRunner(new InMemoryIdempotencyStore());
    let calls = 0;
    const fn = async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 10));
      return calls;
    };

    const [a, b] = await Promise.all([runner.run('k', fn), runner.run('k', fn)]);

    expect(calls).toBe(1);
    expect(a.value).toBe(1);
    expect(b.value).toBe(1);
    expect(a.replayed === false || b.replayed === false).toBe(true);
  });

  it('chaves diferentes executam independentemente', async () => {
    const runner = new IdempotencyRunner(new InMemoryIdempotencyStore());
    const fn = vi.fn(async (n: number) => n * 2);

    const a = await runner.run('a', () => fn(1));
    const b = await runner.run('b', () => fn(2));

    expect(a.value).toBe(2);
    expect(b.value).toBe(4);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
