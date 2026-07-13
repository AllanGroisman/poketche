import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getSession, onAuthStateChange } from '../../services/auth';

/**
 * Estado da sessão Supabase. `session === undefined` = ainda carregando;
 * `null` = deslogado; objeto = logado. Reage a login/logout em tempo real.
 */
export function useSession(): { session: Session | null | undefined; loading: boolean } {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    getSession().then(setSession);
    const sub = onAuthStateChange(setSession);
    return () => sub.unsubscribe();
  }, []);

  return { session, loading: session === undefined };
}
