import { useCallback, useEffect, useState } from 'react';

/**
 * Hook de carregamento assíncrono com estados explícitos (loading/error/data) e `reload`.
 * Base para telas que buscam dados da API — alimenta o `AsyncBoundary`.
 */
export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  reload: () => void;
}

export function useAsync<T>(fn: () => Promise<T>, deps: readonly unknown[] = []): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // fn muda a cada render; controlamos a reexecução pelas deps declaradas pelo chamador.
  const run = useCallback(fn, deps);

  const load = useCallback(() => {
    let active = true;
    setLoading(true);
    setError(null);
    run()
      .then((d) => active && setData(d))
      .catch((e) => active && setError(e instanceof Error ? e : new Error(String(e))))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [run]);

  useEffect(() => load(), [load]);

  return { data, loading, error, reload: load };
}
