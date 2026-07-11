import { z } from 'zod';

/**
 * Configuração validada a partir de variáveis de ambiente. Segredos vêm do .env
 * (nunca commitado). `loadConfig()` falha rápido se algo obrigatório faltar.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('0.0.0.0'),

  DATABASE_URL: z.string().url(),

  // Auth (Supabase) — opcionais em dev local, exigidos em produção.
  SUPABASE_JWKS_URL: z.string().url().optional(),
  SUPABASE_JWT_ISSUER: z.string().optional(),

  // Integrações externas — preenchidas conforme as fases avançam.
  POKEMONTCG_API_KEY: z.string().optional(),
  TCGDEX_BASE_URL: z.string().url().default('https://api.tcgdex.net/v2'),
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET_IMAGES: z.string().default('poketche-images'),
  R2_BUCKET_DISPUTES: z.string().default('poketche-disputes'),
  PAGARME_API_KEY: z.string().optional(),
  EXPO_ACCESS_TOKEN: z.string().optional(),
});

export type AppConfig = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Configuração inválida:\n${issues}`);
  }
  return parsed.data;
}
