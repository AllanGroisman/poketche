import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type Session, type Subscription } from '@supabase/supabase-js';
import Constants from 'expo-constants';

/**
 * Sessão de autenticação delegada ao Supabase (constituição II — nada de auth própria).
 * A publishable key é pública por design (embarcada no app). A sessão persiste em
 * AsyncStorage e o token é renovado automaticamente; a API valida o JWT via JWKS.
 */

const extra = Constants.expoConfig?.extra ?? {};
const SUPABASE_URL = extra.supabaseUrl as string | undefined;
const SUPABASE_KEY = extra.supabasePublishableKey as string | undefined;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  // Falha explícita em dev: sem config não há login.
  console.warn('[auth] supabaseUrl/supabasePublishableKey ausentes em app.json > extra');
}

export const supabase = createClient(SUPABASE_URL ?? '', SUPABASE_KEY ?? '', {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export async function getSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

/** Token de acesso atual (Bearer) ou null quando deslogado — usado pelo cliente da API. */
export async function getAccessToken(): Promise<string | null> {
  const session = await getSession();
  return session?.access_token ?? null;
}

export function onAuthStateChange(cb: (session: Session | null) => void): Subscription {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => cb(session));
  return data.subscription;
}

export async function signInWithEmail(email: string, password: string): Promise<Session> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  if (!data.session) throw new Error('sessão não retornada');
  return data.session;
}

export async function signUpWithEmail(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
