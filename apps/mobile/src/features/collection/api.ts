import { apiRequest } from '../../services/api';

/** Tipos e chamadas da busca de catálogo e da coleção (US2). */

export type Condition = 'mint' | 'near_mint' | 'excellent' | 'good' | 'played' | 'damaged';
export type Language = 'en' | 'pt';
export type Variant = 'normal' | 'reverse_foil' | 'holo';

export interface CardResult {
  id: string;
  external_id: string;
  number: string;
  rarity: string;
  set: { external_id: string; name: string };
  translation_id: string;
  language: Language;
  name: string;
  image_small_url: string;
  image_large_url: string;
}

export interface CollectionItem {
  id: string;
  condition: Condition;
  language: Language;
  variant: Variant;
  quantity: number;
  acquisition_price_cents: number | null;
  added_at: string;
  card: Omit<CardResult, 'supertype' | 'types'>;
}

export interface AddItemInput {
  card_id: string;
  condition: Condition;
  language: Language;
  variant: Variant;
  quantity: number;
  acquisition_price_cents?: number | null;
}

export const searchCards = (q: string, lang: Language = 'pt') =>
  apiRequest<{ results: CardResult[] }>('/catalog/cards', {
    auth: false,
    query: { q, lang },
  });

export const getCollection = (sort: 'recent' | 'oldest' = 'recent') =>
  apiRequest<{ items: CollectionItem[] }>('/collection', { query: { sort } });

export const addItem = (body: AddItemInput) =>
  apiRequest<{ item: CollectionItem; wishlist_matches: unknown[] }>('/collection/items', {
    method: 'POST',
    body,
  });

export const updateItem = (id: string, body: Partial<Omit<AddItemInput, 'card_id'>>) =>
  apiRequest<{ item: CollectionItem }>(`/collection/items/${id}`, { method: 'PATCH', body });

export const deleteItem = (id: string) =>
  apiRequest<{ deleted: boolean }>(`/collection/items/${id}`, { method: 'DELETE' });

// Rótulos em PT para os enums.
export const CONDITION_LABELS: Record<Condition, string> = {
  mint: 'Mint',
  near_mint: 'Near Mint',
  excellent: 'Excellent',
  good: 'Good',
  played: 'Played',
  damaged: 'Damaged',
};
export const VARIANT_LABELS: Record<Variant, string> = {
  normal: 'Normal',
  reverse_foil: 'Reverse Foil',
  holo: 'Holo',
};
export const LANGUAGE_LABELS: Record<Language, string> = { pt: 'Português', en: 'Inglês' };
