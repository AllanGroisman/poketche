import type { HttpJson } from '../../catalog/http.js';
import type { PriceCardRef, PriceProvider, PriceQuote, Variant } from '../types.js';

/**
 * `LigaPriceCollector` — fonte primária BR (Liga Pokémon), **isolada atrás de flag**. O código
 * fica pronto, mas o coletor **só entra no ciclo quando `enabled` for verdadeiro** (config
 * `PRICING_LIGA_ENABLED`), o que depende do parecer legal (T034, research §2). Enquanto isso,
 * o ciclo roda inteiro pela fonte internacional.
 *
 * Resiliência (research §2): seletores/campos centralizados em `LIGA_FIELDS` (um só ponto para
 * ajustar quando o HTML mudar); parser valida a estrutura e lança `LigaParseError` (o job então
 * cai para o fallback e preserva a última cotação); menor oferta por variante é a cotação vigente.
 */

/** Campos esperados na extração da página (centralizados — resiliência a mudança de layout). */
export const LIGA_FIELDS = {
  offers: 'offers',
  price: 'price',
  foil: 'foil',
} as const;

export class LigaParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LigaParseError';
  }
}

export interface RawLigaPrice {
  variant: Variant;
  priceBrlCents: number;
}

/** "R$ 1.234,56" | "12,50" | "R$ 12" → centavos inteiros; null se não parsear. */
export function parseBrlToCents(raw: string): number | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw
    .replace(/r\$/i, '')
    .replace(/\s/g, '')
    .replace(/\./g, '') // separador de milhar
    .replace(',', '.'); // decimal
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100);
}

interface LigaOfferRow {
  [key: string]: unknown;
}
interface LigaPayload {
  [key: string]: unknown;
}

/**
 * Parser puro das ofertas da página da Liga: retorna a **menor** oferta por variante.
 * Lança `LigaParseError` se a estrutura esperada mudar (dispara alerta + fallback no job).
 */
export function parseLigaOffers(payload: unknown): RawLigaPrice[] {
  const offers = (payload as LigaPayload)?.[LIGA_FIELDS.offers];
  if (!Array.isArray(offers)) {
    throw new LigaParseError(`estrutura inesperada: "${LIGA_FIELDS.offers}" não é lista`);
  }
  const cheapest = new Map<Variant, number>();
  for (const row of offers as LigaOfferRow[]) {
    const cents = parseBrlToCents(String(row[LIGA_FIELDS.price] ?? ''));
    if (cents == null) continue; // oferta ilegível é ignorada, não derruba o parse
    const variant: Variant = row[LIGA_FIELDS.foil] ? 'holo' : 'normal';
    const prev = cheapest.get(variant);
    if (prev == null || cents < prev) cheapest.set(variant, cents);
  }
  return [...cheapest].map(([variant, priceBrlCents]) => ({ variant, priceBrlCents }));
}

export class LigaPriceCollector implements PriceProvider {
  readonly source = 'liga_pokemon' as const;
  readonly enabled: boolean;
  private readonly baseUrl?: string;

  constructor(
    private readonly http: HttpJson,
    opts: { enabled: boolean; baseUrl?: string },
  ) {
    this.enabled = opts.enabled;
    this.baseUrl = opts.baseUrl;
  }

  async quotesFor(ref: PriceCardRef): Promise<PriceQuote[]> {
    if (!this.baseUrl) {
      throw new LigaParseError('LIGA_BASE_URL não configurada — coletor não pode operar');
    }
    // A coleta real (fora do escopo até T034) buscaria a página do card. Estrutura pronta:
    const payload = await this.http(`${this.baseUrl}/card/${encodeURIComponent(ref.externalId)}`);
    const offers = parseLigaOffers(payload);
    const fetchedAt = new Date();
    return offers.map((o) => ({
      variant: o.variant,
      condition: null,
      priceCents: o.priceBrlCents,
      source: this.source,
      fxRate: null, // preço já em BRL, sem conversão
      fetchedAt,
    }));
  }
}
