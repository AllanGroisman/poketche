import { createHttpJson, type HttpJson } from './http.js';
import { PokemonTcgClient } from './pokemontcgio.js';
import { TcgdexClient } from './tcgdex.js';
import type { CatalogCard, CatalogProvider, CatalogSet, CatalogTranslation } from './types.js';

/**
 * Provider de catálogo composto: pokemontcg.io (canônico EN) + TCGdex (PT).
 * `mergePtTranslations` é pura e testável: anexa a tradução PT à carta EN quando há
 * correspondência por número, preservando EN como fonte de verdade.
 */
export function mergePtTranslations(
  enCards: CatalogCard[],
  ptByNumber: Map<string, CatalogTranslation>,
): CatalogCard[] {
  if (ptByNumber.size === 0) return enCards;
  return enCards.map((card) => {
    const pt = ptByNumber.get(card.number);
    if (!pt) return card;
    // EN primeiro (canônico), PT em seguida.
    return { ...card, translations: [...card.translations, pt] };
  });
}

export class HttpCatalogProvider implements CatalogProvider {
  constructor(
    private readonly pokemon: PokemonTcgClient,
    private readonly tcgdex: TcgdexClient,
  ) {}

  listSets(): Promise<CatalogSet[]> {
    return this.pokemon.listSets();
  }

  async listCards(set: CatalogSet): Promise<CatalogCard[]> {
    const [enCards, ptByNumber] = await Promise.all([
      this.pokemon.listCardsBySet(set.externalId),
      this.tcgdex.ptTranslationsForSet(set.externalId, set.totalCards),
    ]);
    return mergePtTranslations(enCards, ptByNumber);
  }
}

export interface CatalogProviderConfig {
  POKEMONTCG_API_KEY?: string;
  TCGDEX_BASE_URL: string;
}

export function createCatalogProvider(
  config: CatalogProviderConfig,
  http: HttpJson = createHttpJson(),
): CatalogProvider {
  const pokemon = new PokemonTcgClient(http, { apiKey: config.POKEMONTCG_API_KEY });
  const tcgdex = new TcgdexClient(http, { baseUrl: config.TCGDEX_BASE_URL });
  return new HttpCatalogProvider(pokemon, tcgdex);
}
