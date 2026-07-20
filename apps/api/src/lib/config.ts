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

  // Base do link público compartilhável (deep link do app / web). Ex.: poketche://public/
  SHARE_LINK_BASE_URL: z.string().default('poketche://public/'),

  // Auth (Supabase) — opcionais em dev local, exigidos em produção.
  SUPABASE_JWKS_URL: z.string().url().optional(),
  SUPABASE_JWT_ISSUER: z.string().optional(),

  // Integrações externas — preenchidas conforme as fases avançam.
  POKEMONTCG_API_KEY: z.string().optional(),
  TCGDEX_BASE_URL: z.string().url().default('https://api.tcgdex.net/v2'),
  // Timeout das chamadas HTTP de catálogo. A pokemontcg.io oscila muito; páginas de 250
  // registros podem levar dezenas de segundos, então o default é generoso (60s).
  CATALOG_HTTP_TIMEOUT_MS: z.coerce.number().int().positive().default(60000),

  // Precificação (US3). A fonte internacional (USD + PTAX) é a base do dia 1; a coleta da
  // Liga permanece DESLIGADA por padrão até o parecer legal (T034) — flag por string para
  // não cair na coerção de boolean do Zod (Boolean('false') === true).
  INTL_PRICE_BASE_URL: z.string().url().default('https://api.pokemontcg.io/v2'),
  PTAX_BASE_URL: z
    .string()
    .url()
    .default('https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata'),
  PRICING_SANITY_MAX_FACTOR: z.coerce.number().positive().default(5),
  PRICING_LIGA_ENABLED: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  LIGA_BASE_URL: z.string().url().optional(),
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET_IMAGES: z.string().default('poketche-images'),
  R2_BUCKET_DISPUTES: z.string().default('poketche-disputes'),
  PAGARME_API_KEY: z.string().optional(),
  EXPO_ACCESS_TOKEN: z.string().optional(),

  // Wishlists (US9). Intervalo mínimo entre dois pushes da mesma carta (FR-047) — é uma
  // condição adicional ao rearme, nunca um gatilho por si (ver modules/wishlist/alerts.ts).
  WISHLIST_ALERT_MIN_INTERVAL_HOURS: z.coerce.number().positive().default(24),

  // Scanner (US5). Confiança mínima para dar a carta por identificada; abaixo disso a captura
  // entra como "a revisar" com candidatos (FR-023). A escala está em integrations/identifier/
  // catalog-lookup.ts: acerto só por nome satura em 0.5, então o default de 0.6 exige que o
  // número impresso também tenha casado.
  SCANNER_CONFIDENCE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.6),
  // Teto do crop aceito por captura (FR-021/SC-006a) — o app manda a carta recortada, não a cena.
  SCANNER_MAX_CROP_KB: z.coerce.number().int().positive().default(1024),
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
