import { apiRequest } from '../../services/api';
import type { CardPrice, CardResult, Condition, Language, Variant } from '../collection/api';

/**
 * Visão pública de coleção compartilhada (US7, FR-003b). Rota de visitante: `auth: false`.
 * Campos nulos significam "o dono não autorizou" — a leitura correta depende de `visibility`.
 */

export interface PublicCollectionItem {
  condition: Condition;
  language: Language;
  variant: Variant;
  /** null quando o dono ocultou as quantidades. */
  quantity: number | null;
  /** null quando o dono ocultou os valores — ou quando a carta não tem cotação. */
  price: CardPrice | null;
  position_value_cents: number | null;
  card: CardResult;
}

export interface PublicCollection {
  owner: { display_name: string };
  visibility: { show_cards: boolean; show_values: boolean; show_quantities: boolean };
  stats: { distinct_cards: number; sets: number; total_cards: number | null };
  /** null quando o dono não autorizou valores. */
  summary: { total_cents: number; priced_items: number; unpriced_items: number } | null;
  items: PublicCollectionItem[];
}

export const getPublicCollection = (shareToken: string) =>
  apiRequest<PublicCollection>(`/public/collections/${encodeURIComponent(shareToken)}`, {
    auth: false,
  });
