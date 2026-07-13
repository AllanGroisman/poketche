/**
 * Tipos normalizados do catálogo (constituição V — isolamento de dados de terceiros).
 * As fontes externas (pokemontcg.io canônico EN, TCGdex PT) são mapeadas para estas
 * formas antes de tocar o domínio; nenhum shape de terceiro vaza para além deste módulo.
 */

export type CatalogLanguage = 'en' | 'pt';
export type CatalogSourceName = 'pokemontcgio' | 'tcgdex';

export interface CatalogSet {
  externalId: string;
  name: string;
  series: string;
  totalCards: number;
  /** ISO date (YYYY-MM-DD) ou null quando a fonte não informa. */
  releaseDate: string | null;
  logoUrl: string | null;
}

export interface CatalogTranslation {
  language: CatalogLanguage;
  name: string;
  imageSmallUrl: string;
  imageLargeUrl: string;
  source: CatalogSourceName;
}

export interface CatalogCard {
  externalId: string;
  setExternalId: string;
  number: string;
  rarity: string;
  supertype: string;
  subtypes: string[];
  types: string[];
  /** `en` sempre presente (fonte canônica); `pt` opcional — fallback EN em runtime (FR-011). */
  translations: CatalogTranslation[];
}

/**
 * Contrato do adapter de catálogo. O job `catalog-sync` (T017) itera as edições e,
 * para cada uma, busca as cartas já com as traduções casadas por set/número.
 */
export interface CatalogProvider {
  listSets(): Promise<CatalogSet[]>;
  listCards(set: CatalogSet): Promise<CatalogCard[]>;
}
