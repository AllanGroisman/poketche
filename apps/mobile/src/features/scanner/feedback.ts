import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { getWishlist, getWishlists } from '@/features/wishlist/api';
import type { CaptureResponse } from './api';

/**
 * Feedback em camadas do scanner (T071, FR-054/FR-055): cada captura vira um sinal padrão ou
 * **celebratório**, e a duplicata aparece como incremento em vez de nova carta.
 *
 * O que dá para saber **no momento da captura**: a resposta traz `duplicate`, o `status`
 * (identificada/a revisar) e a raridade da carta. Valor e wishlist **não** vêm por captura (seriam
 * uma cotação e uma consulta por carta durante o escaneamento rápido). A wishlist é resolvida de
 * um jeito barato: carregamos o conjunto de cartas desejadas **uma vez** ao abrir a sessão e
 * conferimos localmente. O destaque por valor é agregado — aparece no resumo da revisão
 * (`most_valuable`), não como flash por carta.
 */

export type FeedbackKind = 'added' | 'duplicate' | 'rare' | 'wishlist' | 'review';

export interface CaptureFeedback {
  kind: FeedbackKind;
  celebratory: boolean;
  title: string;
  detail: string;
}

/** Raridade que merece celebração: qualquer coisa acima de comum/incomum. */
function isRare(rarity: string | undefined | null): boolean {
  if (!rarity) return false;
  const r = rarity.toLowerCase();
  return !r.startsWith('common') && !r.startsWith('uncommon');
}

/**
 * Classifica a captura para o feedback. Prioridade: wishlist (o que o usuário mais espera) →
 * raridade → duplicata → adição comum; "a revisar" é o caso neutro (o OCR não bateu o limiar).
 */
export function classifyCapture(
  res: CaptureResponse,
  wishlistCardIds: ReadonlySet<string>,
): CaptureFeedback {
  const { capture, duplicate } = res;
  const cardName = capture.card?.name ?? 'Carta';

  if (capture.status === 'needs_review') {
    return {
      kind: 'review',
      celebratory: false,
      title: 'A revisar',
      detail: 'Não deu para identificar com certeza — resolva na revisão.',
    };
  }

  const cardId = capture.card?.id;
  if (cardId && wishlistCardIds.has(cardId)) {
    return {
      kind: 'wishlist',
      celebratory: true,
      title: 'Da sua wishlist! ⭐',
      detail: cardName,
    };
  }

  if (isRare(capture.card?.rarity)) {
    return {
      kind: 'rare',
      celebratory: true,
      title: `${capture.card?.rarity} ✨`,
      detail: cardName,
    };
  }

  if (duplicate) {
    return {
      kind: 'duplicate',
      celebratory: false,
      title: `Duplicata · agora ${capture.quantity}×`,
      detail: cardName,
    };
  }

  return { kind: 'added', celebratory: false, title: 'Adicionada', detail: cardName };
}

/**
 * Cartas em qualquer wishlist do usuário, carregadas uma vez por sessão. Falha vira conjunto vazio:
 * o scanner não pode depender das wishlists para funcionar (o feedback é acessório).
 */
export async function loadWishlistCardIds(): Promise<Set<string>> {
  try {
    const lists = await getWishlists();
    const details = await Promise.all(lists.map((l) => getWishlist(l.id)));
    const ids = new Set<string>();
    for (const d of details) for (const item of d.items) ids.add(item.card.id);
    return ids;
  } catch {
    return new Set<string>();
  }
}

// ---- Preferência de sons/vibração (toggleável, FR-055) ----

const FEEDBACK_KEY = 'scan.feedbackEnabled';

/** Vibração/sons ligados? Default ligado. */
export async function isFeedbackEnabled(): Promise<boolean> {
  const stored = await AsyncStorage.getItem(FEEDBACK_KEY);
  return stored !== 'false';
}

export async function setFeedbackEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(FEEDBACK_KEY, enabled ? 'true' : 'false');
}

/**
 * Dispara o retorno tátil da captura (as celebrações vibram mais forte). Nunca lança: em aparelho
 * sem motor de vibração é um no-op silencioso.
 */
export function playFeedback(feedback: CaptureFeedback, enabled: boolean): void {
  if (!enabled) return;
  const style = feedback.celebratory
    ? Haptics.NotificationFeedbackType.Success
    : feedback.kind === 'review'
      ? Haptics.NotificationFeedbackType.Warning
      : null;
  if (style) void Haptics.notificationAsync(style).catch(() => {});
  else void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}
