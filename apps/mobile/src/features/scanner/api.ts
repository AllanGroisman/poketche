import { apiRequest } from '@/services/api';
import type { Condition, Language, Variant } from '@/features/collection/api';
// Type-only: o ciclo scanner↔wishlist é apagado na compilação e não vira require circular.
import type { WishlistMatch } from '@/features/wishlist/api';

/**
 * Cliente das sessões de escaneamento (US5, T069). Espelha `apps/api/src/modules/scanner`.
 *
 * A sessão é um rascunho: nada entra na coleção até `confirmSession`. Toda escrita (capturas,
 * edições, manual, discard) só vale enquanto a sessão está `pending` — a API responde 409 depois.
 */

export type ScanMethod = 'ocr' | 'visual_match' | 'manual';
export type ScanCaptureStatus = 'identified' | 'needs_review';
export type CameraSide = 'back' | 'front';

/** Palpite de carta para uma captura "a revisar" (busca trigram pelo nome lido). */
export interface ScanCandidate {
  card_id: string;
  name: string;
  number: string;
  set_name: string;
  language: Language;
  confidence: number;
}

/** Carta resolvida de uma captura (mesmo shape do catálogo, já localizada). */
export interface ScanCard {
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

export interface ScanCapture {
  id: string;
  status: ScanCaptureStatus;
  candidates: ScanCandidate[];
  /** Nula até a revisão definir — condição não é detectável por imagem. */
  condition: Condition | null;
  language: Language | null;
  variant: Variant;
  quantity: number;
  /** Falso quando o idioma foi um fallback (FR-067) ou corrigido à mão. */
  language_detected: boolean;
  method: ScanMethod;
  created_at: string;
  card: ScanCard | null;
}

export interface ScanSession {
  id: string;
  status: 'pending' | 'confirmed' | 'discarded';
  camera: CameraSide;
  recorded: boolean;
  created_at: string;
  confirmed_at: string | null;
  discarded_at: string | null;
  capture_count?: number;
}

export interface ScanSessionDetail extends ScanSession {
  captures: ScanCapture[];
}

/** Resumo estatístico da revisão (FR-057). */
export interface ScanSummary {
  total_cards: number;
  needs_review: number;
  total_value_cents: number;
  unpriced_cards: number;
  by_rarity: { rarity: string; count: number }[];
  by_set: { set_name: string; count: number }[];
  most_valuable: { card_name: string; value_cents: number } | null;
  in_wishlists: number;
}

export interface ScanConfirmResult {
  session_id: string;
  added_cards: number;
  skipped_captures: number;
  wishlist_matches: WishlistMatch[];
  wishlist_auto_removed: boolean;
}

export interface CaptureResponse {
  capture: ScanCapture;
  /** True quando incrementou uma captura já existente (mesma carta na sessão, FR-053). */
  duplicate: boolean;
}

export const createSession = (camera: CameraSide, recorded = false) =>
  apiRequest<ScanSession>('/scan/sessions', {
    method: 'POST',
    body: { camera, recorded },
  });

export const getPendingSession = () =>
  apiRequest<{ session: ScanSession | null }>('/scan/sessions/pending').then((r) => r.session);

export const getSession = (id: string) => apiRequest<ScanSessionDetail>(`/scan/sessions/${id}`);

export const patchSession = (id: string, body: { camera?: CameraSide; recorded?: boolean }) =>
  apiRequest<ScanSession>(`/scan/sessions/${id}`, { method: 'PATCH', body });

/** Envia o crop da moldura (base64 já comprimido) para identificação no backend (FR-021). */
export const addCapture = (id: string, imageBase64: string) =>
  apiRequest<CaptureResponse>(`/scan/sessions/${id}/captures`, {
    method: 'POST',
    body: { image_base64: imageBase64 },
  });

export interface ManualCaptureInput {
  card_id: string;
  condition?: Condition;
  language?: Language;
  variant?: Variant;
  quantity?: number;
}

/** Adiciona manualmente uma carta não detectada (FR-056). */
export const addManualCapture = (id: string, body: ManualCaptureInput) =>
  apiRequest<{ capture: ScanCapture }>(`/scan/sessions/${id}/manual`, { method: 'POST', body });

export interface PatchCaptureInput {
  card_id?: string;
  condition?: Condition;
  language?: Language;
  variant?: Variant;
  quantity?: number;
}

/** Resolve "a revisar" e ajusta qty/condição/idioma/variante (FR-056). */
export const patchCapture = (id: string, captureId: string, body: PatchCaptureInput) =>
  apiRequest<{ capture: ScanCapture }>(`/scan/sessions/${id}/captures/${captureId}`, {
    method: 'PATCH',
    body,
  });

export const deleteCapture = (id: string, captureId: string) =>
  apiRequest<null>(`/scan/sessions/${id}/captures/${captureId}`, { method: 'DELETE' });

export const getSummary = (id: string) => apiRequest<ScanSummary>(`/scan/sessions/${id}/summary`);

/** Único ponto que grava na coleção (FR-058). */
export const confirmSession = (id: string) =>
  apiRequest<ScanConfirmResult>(`/scan/sessions/${id}/confirm`, { method: 'POST' });

export const discardSession = (id: string) =>
  apiRequest<ScanSession>(`/scan/sessions/${id}/discard`, { method: 'POST' });
