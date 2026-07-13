import type { ReactNode } from 'react';
import { ApiError } from '../services/api';
import type { AsyncState } from '../lib/useAsync';
import { ErrorState, LoadingState } from './states';

/**
 * Renderiza loading/erro (com retry) ou os filhos com os dados já resolvidos.
 * Padroniza o tratamento das três fases em qualquer tela que use `useAsync`.
 */
export function AsyncBoundary<T>({
  state,
  children,
  loadingLabel,
}: {
  state: AsyncState<T>;
  children: (data: T) => ReactNode;
  loadingLabel?: string;
}) {
  if (state.loading && state.data === null) return <LoadingState label={loadingLabel} />;
  if (state.error) return <ErrorState message={messageFor(state.error)} onRetry={state.reload} />;
  if (state.data === null) return <LoadingState label={loadingLabel} />;
  return <>{children(state.data)}</>;
}

function messageFor(error: Error): string {
  if (error instanceof ApiError) return error.message;
  return 'Não foi possível carregar. Verifique sua conexão.';
}
