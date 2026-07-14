import { createHttpJson, type HttpJson } from '../catalog/http.js';
import { IntlUsdPriceProvider, PokemonTcgPriceSource } from './international.js';
import { LigaPriceCollector } from './liga/collector.js';
import { PtaxClient } from './ptax.js';
import type { PriceCardRef, PriceProvider, PriceQuote } from './types.js';

/**
 * Resolve o preço de uma carta consultando as fontes **em ordem de prioridade** com
 * **fallback por carta** (research §2): tenta a primária (Liga, quando habilitada); se ela
 * estiver desabilitada, falhar ou não ter preço para a carta, cai para a próxima fonte. A
 * última fonte é a internacional (USD+PTAX), operante desde o dia 1.
 */
export class PriceResolver {
  /** @param providers fontes já filtradas por `enabled`, em ordem de prioridade. */
  constructor(private readonly providers: PriceProvider[]) {}

  get sources(): string[] {
    return this.providers.map((p) => p.source);
  }

  async resolve(ref: PriceCardRef): Promise<PriceQuote[]> {
    for (const provider of this.providers) {
      try {
        const quotes = await provider.quotesFor(ref);
        if (quotes.length > 0) return quotes;
      } catch {
        // Fonte indisponível/HTML mudou → tenta a próxima (fallback automático).
        continue;
      }
    }
    return [];
  }
}

export interface PriceResolverConfig {
  INTL_PRICE_BASE_URL: string;
  PTAX_BASE_URL: string;
  POKEMONTCG_API_KEY?: string;
  PRICING_LIGA_ENABLED: boolean;
  LIGA_BASE_URL?: string;
}

/**
 * Monta o resolver a partir da config. O coletor da Liga só é **incluído** quando a flag
 * está ligada (código pronto, mas fora do ciclo até T034); caso contrário o resolver opera
 * só com a fonte internacional.
 */
export function createPriceResolver(
  config: PriceResolverConfig,
  http: HttpJson = createHttpJson(),
): PriceResolver {
  const providers: PriceProvider[] = [];

  const liga = new LigaPriceCollector(http, {
    enabled: config.PRICING_LIGA_ENABLED,
    baseUrl: config.LIGA_BASE_URL,
  });
  if (liga.enabled) providers.push(liga); // primária BR, só quando habilitada

  const intlSource = new PokemonTcgPriceSource(http, {
    apiKey: config.POKEMONTCG_API_KEY,
    baseUrl: config.INTL_PRICE_BASE_URL,
  });
  const ptax = new PtaxClient(http, { baseUrl: config.PTAX_BASE_URL });
  providers.push(new IntlUsdPriceProvider(intlSource, ptax)); // fallback base

  return new PriceResolver(providers);
}
