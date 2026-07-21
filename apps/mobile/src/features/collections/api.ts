import { apiRequest } from '@/services/api';
import type { CollectionItem } from '@/features/collection/api';

/**
 * Coleções personalizadas (feature 002 — US1..US5): pastas que recortam o inventário.
 * O item do recorte tem o MESMO shape da listagem do inventário (`CollectionItem`), então as
 * telas reusam a mesma apresentação (linha de carta, `PriceTag`, `TrendBadge`).
 */

/** Resumo do recorte no formato do dashboard (US4): cartas distintas · unidades · valor. */
export interface CollectionSliceSummary {
  total_cents: number;
  priced_items: number;
  unpriced_items: number;
  distinct_cards: number;
  total_quantity: number;
}

export interface CollectionListEntry {
  id: string;
  name: string;
  summary: CollectionSliceSummary;
  shared: boolean;
  created_at: string;
}

export interface CollectionSlice {
  id: string;
  name: string;
  shared: boolean;
  items: CollectionItem[];
  summary: CollectionSliceSummary;
}

export interface CollectionShareState {
  status: 'private' | 'public_link';
  show_cards: boolean;
  show_values: boolean;
  show_quantities: boolean;
  share_token: string | null;
  share_url: string | null;
}

// ---- pastas (US1/US4) ----

export const getCollections = () =>
  apiRequest<{ collections: CollectionListEntry[] }>('/collections');

export const createCollection = (name: string) =>
  apiRequest<CollectionListEntry>('/collections', { method: 'POST', body: { name } });

export const renameCollection = (id: string, name: string) =>
  apiRequest<{ id: string; name: string; shared: boolean }>(`/collections/${id}`, {
    method: 'PATCH',
    body: { name },
  });

export const deleteCollection = (id: string) =>
  apiRequest<{ deleted: boolean }>(`/collections/${id}`, { method: 'DELETE' });

// ---- vínculos (US2) ----

export const addToCollection = (id: string, collectionItemId: string) =>
  apiRequest<{ linked: boolean; collection_item_id: string }>(`/collections/${id}/items`, {
    method: 'POST',
    body: { collection_item_id: collectionItemId },
  });

export const removeFromCollection = (id: string, collectionItemId: string) =>
  apiRequest<{ unlinked: boolean }>(`/collections/${id}/items/${collectionItemId}`, {
    method: 'DELETE',
  });

// ---- recorte (US3) ----

export const getCollectionSlice = (id: string, sort: 'recent' | 'oldest' = 'recent') =>
  apiRequest<CollectionSlice>(`/collections/${id}`, { query: { sort } });

// ---- compartilhamento (US5) ----

export const getCollectionShare = (id: string) =>
  apiRequest<CollectionShareState>(`/collections/${id}/visibility`);

export const setCollectionVisibility = (
  id: string,
  flags: { show_cards: boolean; show_values: boolean; show_quantities: boolean },
) =>
  apiRequest<CollectionShareState>(`/collections/${id}/visibility`, { method: 'PUT', body: flags });

export const generateShareLink = (id: string) =>
  apiRequest<CollectionShareState>(`/collections/${id}/share-link`, {
    method: 'POST',
    body: { action: 'generate' },
  });

export const revokeShareLink = (id: string) =>
  apiRequest<CollectionShareState>(`/collections/${id}/share-link`, {
    method: 'POST',
    body: { action: 'revoke' },
  });
