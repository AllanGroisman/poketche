import Constants from 'expo-constants';
import { getAccessToken } from './auth';

/**
 * Cliente REST tipado da API PokeTche. Anexa o Bearer token da sessão Supabase quando
 * há login, e normaliza o erro padrão da API (`{error:{code,message}}`) em `ApiError`.
 * A base URL vem de app.json (extra.apiBaseUrl).
 */

const BASE_URL =
  (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined) ?? 'http://localhost:3000/api/v1';

// /health fica fora do prefixo /api/v1.
const ROOT_URL = BASE_URL.replace(/\/api\/v1\/?$/, '');

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Requer sessão: anexa o Bearer token (default: true). */
  auth?: boolean;
  /** Header de idempotência para rotas financeiras. */
  idempotencyKey?: string;
  query?: Record<string, string | number | undefined>;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = `${BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined) params.append(k, String(v));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true, idempotencyKey, query } = options;
  const headers: Record<string, string> = { Accept: 'application/json' };

  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  if (auth) {
    const token = await getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(buildUrl(path, query), {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const isJson = res.headers.get('content-type')?.includes('application/json');
  const payload: unknown = isJson ? await res.json() : null;

  if (!res.ok) {
    const err = (payload as { error?: { code?: string; message?: string } })?.error;
    throw new ApiError(res.status, err?.code ?? 'unknown', err?.message ?? `HTTP ${res.status}`);
  }
  return payload as T;
}

// ---- Health (fora do prefixo) ----

export interface HealthResponse {
  status: string;
  service: string;
}

export async function getHealth(): Promise<HealthResponse> {
  const res = await fetch(`${ROOT_URL}/health`);
  if (!res.ok) throw new Error(`health ${res.status}`);
  return (await res.json()) as HealthResponse;
}
