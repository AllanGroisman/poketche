import Constants from 'expo-constants';

/**
 * Cliente REST da API PokeTche. A base URL vem de app.json (extra.apiBaseUrl).
 * Auth (Supabase) e endpoints de domínio entram nas fases correspondentes.
 */
const BASE_URL =
  (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined) ?? 'http://localhost:3000/api/v1';

// /health fica fora do prefixo /api/v1.
const ROOT_URL = BASE_URL.replace(/\/api\/v1\/?$/, '');

export interface HealthResponse {
  status: string;
  service: string;
}

export async function getHealth(): Promise<HealthResponse> {
  const res = await fetch(`${ROOT_URL}/health`);
  if (!res.ok) throw new Error(`health ${res.status}`);
  return (await res.json()) as HealthResponse;
}
