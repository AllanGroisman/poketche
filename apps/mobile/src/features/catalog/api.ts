import { apiRequest } from '../../services/api';
import type { CardPrice, CardResult, Condition, Language, Variant } from '../collection/api';

/**
 * Explorador de catálogo (US10, FR-068–FR-072). As rotas de navegação são públicas (`auth:
 * false`) e cacheadas pela API; **posse e completude são autenticadas** e vêm separadas — o app
 * compõe as duas coisas na tela, e o visitante simplesmente não pede a segunda.
 */

export interface CatalogSet {
  id: string;
  external_id: string;
  name: string;
  series: string;
  release_date: string | null;
  total_cards: number;
  logo_url: string | null;
}

export interface GridCard extends CardResult {
  supertype: string;
  types: string[];
}

export interface PeriodChange {
  from_cents: number;
  to_cents: number;
  change_cents: number;
  change_pct: number;
}

/** Preço de referência da carta: vem com a condição/variante a que se refere (sem item, o
 *  número sozinho seria ambíguo). */
export interface MarketPrice extends CardPrice {
  condition: Condition | null;
  variant: Variant;
}

export interface CardDetail {
  id: string;
  external_id: string;
  number: string;
  rarity: string;
  supertype: string;
  subtypes: string[];
  types: string[];
  set: {
    id: string;
    external_id: string;
    name: string;
    release_date: string | null;
    total_cards: number;
    logo_url: string | null;
  };
  translation_id: string;
  language: Language;
  name: string;
  image_small_url: string;
  image_large_url: string;
  market_price: MarketPrice | null;
  history_available: boolean;
  change_30d: PeriodChange | null;
  high_low: { high_cents: number; low_cents: number } | null;
}

export interface SetCompletion {
  set: { id: string; external_id: string; name: string; total_cards: number };
  owned: number;
  /** Total impresso da edição — base do percentual, igual ao dashboard. */
  total: number;
  pct: number;
  /** Cartas já sincronizadas no catálogo; pode ser menor que `total` com sync parcial. */
  catalog_cards: number;
  owned_cards: { card_id: string; quantity: number }[];
  missing_card_ids: string[];
}

export interface CardListing {
  id: string;
  price_cents: number;
  shipping_price_cents: number;
  condition: Condition;
  language: Language;
  variant: Variant;
  quantity_available: number;
  seller: { id: string; display_name: string };
}

export interface SearchFilters {
  q?: string;
  set?: string;
  rarity?: string;
  type?: string;
  price_min?: number;
  price_max?: number;
  lang?: Language;
  page?: number;
  limit?: number;
}

export interface SearchPage {
  page: number;
  limit: number;
  total: number;
  has_more: boolean;
  /** Cartas fora do resultado por não terem cotação, com filtro de preço ativo (FR-069). */
  unpriced_excluded: number;
  results: GridCard[];
}

export const getSets = () => apiRequest<{ sets: CatalogSet[] }>('/catalog/sets', { auth: false });

export interface SetCardsPage {
  set: { id: string; external_id: string; name: string; total_cards: number };
  page: number;
  limit: number;
  total: number;
  has_more: boolean;
  cards: GridCard[];
}

export const getSetCards = (setId: string, page = 1, lang: Language = 'pt') =>
  apiRequest<SetCardsPage>(`/catalog/sets/${encodeURIComponent(setId)}/cards`, {
    auth: false,
    query: { page, lang },
  });

export const getCard = (cardId: string, lang: Language = 'pt') =>
  apiRequest<CardDetail>(`/catalog/cards/${cardId}`, { auth: false, query: { lang } });

export const getCardListings = (cardId: string) =>
  apiRequest<{ card_id: string; listings: CardListing[] }>(`/catalog/cards/${cardId}/listings`, {
    auth: false,
  });

/** Requer sessão: indicadores de posse nunca aparecem para visitantes (FR-072). */
export const getSetCompletion = (setId: string) =>
  apiRequest<SetCompletion>(`/catalog/sets/${encodeURIComponent(setId)}/completion`);

export const searchCatalog = (filters: SearchFilters) =>
  apiRequest<SearchPage>('/catalog/cards', {
    auth: false,
    query: { lang: 'pt', ...filters },
  });
