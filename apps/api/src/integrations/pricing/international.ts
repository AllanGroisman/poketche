import type { HttpJson } from '../catalog/http.js';
import type {
  FxRateProvider,
  InternationalPriceSource,
  PriceCardRef,
  PriceProvider,
  PriceQuote,
  RawUsdPrice,
  Variant,
} from './types.js';

/**
 * Fonte internacional de preço (fallback operante desde o dia 1, research §2): lê os blocos
 * de preço **TCGplayer (USD)** que a pokemontcg.io expõe por carta e converte para BRL pela
 * PTAX. Rótulo `intl_usd_fx` deixa claro ao usuário que é referência internacional convertida
 * (FR-012/FR-013). Mapeadores puros, testados por fixtures.
 */

const DEFAULT_BASE_URL = 'https://api.pokemontcg.io/v2';

// Chaves do bloco `tcgplayer.prices` → nossa dimensão de variante.
const VARIANT_BY_KEY: Record<string, Variant> = {
  normal: 'normal',
  holofoil: 'holo',
  reverseHolofoil: 'reverse_foil',
  '1stEditionHolofoil': 'holo',
  '1stEditionNormal': 'normal',
};

interface TcgplayerPriceBlock {
  market?: number | null;
  mid?: number | null;
  low?: number | null;
}
interface RawPricedCard {
  data?: {
    tcgplayer?: { prices?: Record<string, TcgplayerPriceBlock | null> };
  };
}

export function usdToCents(usd: number): number {
  return Math.round(usd * 100);
}

/** Escolhe o preço USD representativo do bloco: market → mid → low. */
function pickUsd(block: TcgplayerPriceBlock | null | undefined): number | null {
  if (!block) return null;
  const usd = block.market ?? block.mid ?? block.low;
  return typeof usd === 'number' && usd > 0 ? usd : null;
}

/** Extrai preços USD por variante do payload cru da pokemontcg.io (função pura). */
export function mapUsdPrices(payload: unknown): RawUsdPrice[] {
  const prices = (payload as RawPricedCard)?.data?.tcgplayer?.prices;
  if (!prices) return [];
  const byVariant = new Map<Variant, number>();
  for (const [key, block] of Object.entries(prices)) {
    const variant = VARIANT_BY_KEY[key];
    const usd = pickUsd(block);
    if (!variant || usd == null) continue;
    // Se duas chaves mapearem à mesma variante, mantém a maior (mais líquida/recente).
    const cents = usdToCents(usd);
    const prev = byVariant.get(variant);
    if (prev == null || cents > prev) byVariant.set(variant, cents);
  }
  return [...byVariant].map(([variant, priceUsdCents]) => ({ variant, priceUsdCents }));
}

/** Converte um preço USD (centavos) em BRL (centavos) por um câmbio BRL/USD. */
export function usdCentsToBrlCents(usdCents: number, fxRate: number): number {
  return Math.round(usdCents * fxRate);
}

export class PokemonTcgPriceSource implements InternationalPriceSource {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;

  constructor(
    private readonly http: HttpJson,
    opts: { apiKey?: string; baseUrl?: string } = {},
  ) {
    this.baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
    this.headers = opts.apiKey ? { 'X-Api-Key': opts.apiKey } : {};
  }

  async usdPricesFor(externalId: string): Promise<RawUsdPrice[]> {
    const payload = await this.http(`${this.baseUrl}/cards/${externalId}`, this.headers);
    return mapUsdPrices(payload);
  }
}

/**
 * Provider internacional: compõe a fonte USD com o câmbio PTAX. Sempre `enabled` (é o
 * fallback base). Uma única leitura de câmbio por chamada é suficiente (a mesma data vale
 * para todas as variantes da carta; o `PtaxClient` ainda cacheia por dia entre chamadas).
 */
export class IntlUsdPriceProvider implements PriceProvider {
  readonly source = 'intl_usd_fx' as const;
  readonly enabled = true;

  constructor(
    private readonly usd: InternationalPriceSource,
    private readonly fx: FxRateProvider,
  ) {}

  async quotesFor(ref: PriceCardRef): Promise<PriceQuote[]> {
    const usdPrices = await this.usd.usdPricesFor(ref.externalId);
    if (usdPrices.length === 0) return [];
    const fxRate = await this.fx.usdToBrl();
    const fetchedAt = new Date();
    return usdPrices.map((p) => ({
      variant: p.variant,
      condition: null, // a fonte internacional não diferencia condição
      priceCents: usdCentsToBrlCents(p.priceUsdCents, fxRate),
      source: this.source,
      fxRate,
      fetchedAt,
    }));
  }
}
