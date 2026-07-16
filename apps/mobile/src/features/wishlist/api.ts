import { apiRequest } from '../../services/api';
import type { CardPrice, Variant } from '../collection/api';

/** Tipos e chamadas das wishlists com preço-alvo (US9, FR-044–FR-052). */

export interface WishlistSummary {
  id: string;
  name: string;
  notifications_enabled: boolean;
  item_count: number;
  created_at: string;
}

export interface WishlistItem {
  id: string;
  card: {
    id: string;
    external_id: string;
    number: string;
    rarity: string;
    name: string;
    image_small_url: string;
    image_large_url: string;
    set: { external_id: string; name: string };
  };
  target_price_cents: number | null;
  price: CardPrice | null;
  /** Qual variante é o preço exibido — a wishlist é da carta, não de uma variante. */
  price_variant: Variant | null;
  price_available: boolean;
  /** Positivo = quanto o preço ainda está acima do alvo; negativo = abaixo. */
  difference_cents: number | null;
  target_reached: boolean;
  in_collection: { owned: boolean; quantity: number };
  listings_at_or_below_target: {
    count: number;
    cheapest: { id: string; price_cents: number; shipping_price_cents: number } | null;
  };
  created_at: string;
}

export interface WishlistDetail {
  id: string;
  name: string;
  notifications_enabled: boolean;
  created_at: string;
  items: WishlistItem[];
  summary: { item_count: number; targets_reached: number; unpriced_items: number };
}

/** Casamento devolvido ao registrar uma carta que está em wishlist (FR-052). */
export interface WishlistMatch {
  wishlist_id: string;
  wishlist_name: string;
  item_id: string;
  target_price_cents: number | null;
  removed: boolean;
}

export const getWishlists = () =>
  apiRequest<{ wishlists: WishlistSummary[] }>('/wishlists').then((r) => r.wishlists);

export const getWishlist = (id: string) => apiRequest<WishlistDetail>(`/wishlists/${id}`);

export const createWishlist = (name: string) =>
  apiRequest<WishlistSummary>('/wishlists', { method: 'POST', body: { name } });

export const updateWishlist = (
  id: string,
  body: { name?: string; notifications_enabled?: boolean },
) => apiRequest<WishlistSummary>(`/wishlists/${id}`, { method: 'PATCH', body });

export const deleteWishlist = (id: string) =>
  apiRequest<{ deleted: boolean }>(`/wishlists/${id}`, { method: 'DELETE' });

export const addWishlistItem = (
  wishlistId: string,
  cardId: string,
  targetPriceCents?: number | null,
) =>
  apiRequest<{ id: string }>(`/wishlists/${wishlistId}/items`, {
    method: 'POST',
    body: { card_id: cardId, target_price_cents: targetPriceCents ?? null },
  });

/** Atalho em lote das faltantes de uma edição (FR-072). */
export const addWishlistItemsBatch = (wishlistId: string, cardIds: string[]) =>
  apiRequest<{ added: number; ignored: number }>(`/wishlists/${wishlistId}/items`, {
    method: 'POST',
    body: { card_ids: cardIds },
  });

export const updateWishlistItem = (
  wishlistId: string,
  itemId: string,
  targetPriceCents: number | null,
) =>
  apiRequest<{ id: string; target_price_cents: number | null }>(
    `/wishlists/${wishlistId}/items/${itemId}`,
    { method: 'PATCH', body: { target_price_cents: targetPriceCents } },
  );

export const removeWishlistItem = (wishlistId: string, itemId: string) =>
  apiRequest<{ deleted: boolean }>(`/wishlists/${wishlistId}/items/${itemId}`, {
    method: 'DELETE',
  });
