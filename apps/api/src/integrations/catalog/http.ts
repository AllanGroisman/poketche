/**
 * Helper HTTP mínimo para os adapters de catálogo. Injetável (`HttpJson`) para que os
 * clientes possam ser testados com respostas de fixture, sem rede.
 */
export type HttpJson = (url: string, headers?: Record<string, string>) => Promise<unknown>;

export class CatalogHttpError extends Error {
  constructor(
    readonly url: string,
    readonly status: number,
  ) {
    super(`catalog HTTP ${status} em ${url}`);
    this.name = 'CatalogHttpError';
  }
}

/** Implementação padrão sobre o `fetch` global (Node 22), com timeout. */
export function createHttpJson(timeoutMs = 20000): HttpJson {
  return async (url, headers) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { headers, signal: controller.signal });
      if (!res.ok) throw new CatalogHttpError(url, res.status);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  };
}
