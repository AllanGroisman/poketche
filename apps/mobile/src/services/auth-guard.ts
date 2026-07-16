import { router } from 'expo-router';
import type { Session } from '@supabase/supabase-js';

/**
 * Guarda de ações restritas (T052, FR-026a, SC-013): comprar, vender, manter coleção ou
 * wishlist exigem conta. Sem sessão, o visitante é conduzido ao cadastro e **volta ao ponto
 * de origem** depois de autenticar.
 *
 * O retorno é guardado em memória (o fluxo cadastro→retorno acontece dentro da mesma sessão
 * do app) e consumido uma única vez pelo layout raiz, que é quem observa a troca de sessão.
 */

let pendingReturn: string | null = null;

/**
 * Libera a ação quando há sessão. Sem sessão, guarda `returnTo`, envia ao cadastro e
 * devolve `false` — o chamador simplesmente não executa a ação.
 */
export function requireSession(session: Session | null, returnTo: string): boolean {
  if (session) return true;
  pendingReturn = returnTo;
  router.push('/(auth)/sign-up');
  return false;
}

/** Consome o destino de retorno pós-autenticação (uma única vez); null se não houver. */
export function takePendingReturn(): string | null {
  const target = pendingReturn;
  pendingReturn = null;
  return target;
}

/** Descarta o retorno pendente — usado quando o visitante abandona o cadastro. */
export function clearPendingReturn(): void {
  pendingReturn = null;
}
