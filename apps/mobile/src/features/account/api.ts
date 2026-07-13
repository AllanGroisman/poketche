import { apiRequest } from '../../services/api';

/** Chamadas tipadas dos endpoints de conta (US1). Respostas em snake_case da API. */

export interface Profile {
  id: string;
  display_name: string;
  notifications_enabled: boolean;
  wishlist_auto_remove: boolean;
  scanner_sounds_enabled: boolean;
  preferred_camera: 'back' | 'front';
  buyer_rating_avg: number;
  buyer_rating_count: number;
}

export interface Visibility {
  status: 'private' | 'public_link';
  show_cards: boolean;
  show_values: boolean;
  show_quantities: boolean;
  share_token: string | null;
  share_url: string | null;
}

export type ProfilePatch = Partial<{
  displayName: string;
  notificationsEnabled: boolean;
  wishlistAutoRemove: boolean;
  scannerSoundsEnabled: boolean;
  preferredCamera: 'back' | 'front';
}>;

export type VisibilityPatch = Partial<{
  status: 'private' | 'public_link';
  show_cards: boolean;
  show_values: boolean;
  show_quantities: boolean;
}>;

export const getMe = () => apiRequest<Profile>('/me');
export const updateMe = (patch: ProfilePatch) =>
  apiRequest<Profile>('/me', { method: 'PATCH', body: patch });

export const getVisibility = () => apiRequest<Visibility>('/me/visibility');
export const updateVisibility = (patch: VisibilityPatch) =>
  apiRequest<Visibility>('/me/visibility', { method: 'PUT', body: patch });

export const generateShareLink = () =>
  apiRequest<Visibility>('/me/visibility/share-link', {
    method: 'POST',
    body: { action: 'generate' },
  });
export const revokeShareLink = () =>
  apiRequest<Visibility>('/me/visibility/share-link', {
    method: 'POST',
    body: { action: 'revoke' },
  });
