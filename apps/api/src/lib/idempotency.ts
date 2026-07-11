/**
 * Idempotência para rotas financeiras (constituição — Princípio IV).
 * Uma mesma `Idempotency-Key` nunca deve efetivar a operação duas vezes; a segunda
 * chamada recebe o resultado da primeira. Suporta também deduplicação de chamadas
 * concorrentes com a mesma chave (in-flight).
 *
 * O `IdempotencyStore` é abstraído para permitir implementação em memória (testes) ou
 * persistente (Postgres) sem mudar a lógica.
 */

export interface IdempotencyStore {
  get(key: string): Promise<unknown | undefined>;
  put(key: string, value: unknown): Promise<void>;
}

export class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly data = new Map<string, unknown>();

  async get(key: string): Promise<unknown | undefined> {
    return this.data.get(key);
  }

  async put(key: string, value: unknown): Promise<void> {
    this.data.set(key, value);
  }
}

export interface IdempotentResult<T> {
  value: T;
  /** true quando o resultado veio de uma execução anterior (ou concorrente) — não reexecutado. */
  replayed: boolean;
}

export class IdempotencyRunner {
  private readonly inflight = new Map<string, Promise<unknown>>();

  constructor(private readonly store: IdempotencyStore) {}

  /**
   * Executa `fn` no máximo uma vez por `key`. Reexecuções retornam o valor persistido;
   * chamadas concorrentes aguardam a execução em andamento.
   */
  async run<T>(key: string, fn: () => Promise<T>): Promise<IdempotentResult<T>> {
    const existing = await this.store.get(key);
    if (existing !== undefined) {
      return { value: existing as T, replayed: true };
    }

    const pending = this.inflight.get(key);
    if (pending) {
      return { value: (await pending) as T, replayed: true };
    }

    const promise = (async () => {
      const value = await fn();
      await this.store.put(key, value);
      return value;
    })();
    this.inflight.set(key, promise);

    try {
      const value = await promise;
      return { value, replayed: false };
    } finally {
      this.inflight.delete(key);
    }
  }
}
