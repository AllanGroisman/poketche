import type { PrismaClient } from '@prisma/client';
import { unprocessable } from '../../lib/errors.js';
import { resolveWishlistMatches, type WishlistMatch } from '../wishlist/matches.js';

/**
 * Confirmação da sessão (T069, FR-058): é **o único ponto** em que o scanner grava na coleção.
 * Antes disso a sessão é rascunho — descartar não deixa rastro na coleção.
 *
 * Duas regras que o fluxo impõe:
 *   - capturas "a revisar" (sem carta) e sem condição definida **não entram**: gravar um palpite
 *     na coleção do usuário é pior do que não gravar. A revisão existe para resolvê-las;
 *   - a gravação é **transacional**: ou a sessão inteira entra e vira `confirmed`, ou nada entra.
 *     Meia sessão confirmada não teria como ser retomada nem repetida sem duplicar cartas.
 */

export interface ConfirmResult {
  session_id: string;
  added_cards: number;
  /** Capturas ignoradas por continuarem "a revisar" — o app avisa em vez de silenciar. */
  skipped_captures: number;
  wishlist_matches: WishlistMatch[];
  wishlist_auto_removed: boolean;
}

export async function confirmSession(
  prisma: PrismaClient,
  userId: string,
  sessionId: string,
): Promise<ConfirmResult> {
  const captures = await prisma.scanCapture.findMany({ where: { sessionId } });

  const ready = captures.filter((c) => c.cardId != null && c.condition != null);
  const skipped = captures.length - ready.length;

  if (ready.length === 0) {
    throw unprocessable('nenhuma captura resolvida para confirmar');
  }

  await prisma.$transaction(async (tx) => {
    for (const c of ready) {
      await tx.collectionItem.upsert({
        where: {
          userId_cardId_condition_language_variant: {
            userId,
            cardId: c.cardId!,
            condition: c.condition!,
            language: c.language ?? 'en',
            variant: c.variant,
          },
        },
        // Mesmo merge do registro manual (FR-009): a carta já possuída soma quantidade.
        update: { quantity: { increment: c.quantity } },
        create: {
          userId,
          cardId: c.cardId!,
          condition: c.condition!,
          language: c.language ?? 'en',
          variant: c.variant,
          quantity: c.quantity,
        },
      });
    }
    await tx.scanSession.update({
      where: { id: sessionId },
      data: { status: 'confirmed', confirmedAt: new Date() },
    });
  });

  // Uma chamada por carta **distinta**: duas capturas da mesma carta são um desejo só, e a
  // segunda chamada voltaria vazia depois de a auto-remoção já ter apagado o item — reportando
  // o casamento uma vez a menos do que aconteceu.
  const distinctCardIds = [...new Set(ready.map((c) => c.cardId!))];
  const matches: WishlistMatch[] = [];
  let autoRemoved = false;
  for (const cardId of distinctCardIds) {
    const res = await resolveWishlistMatches(prisma, userId, cardId);
    matches.push(...res.matches);
    autoRemoved ||= res.auto_removed;
  }

  return {
    session_id: sessionId,
    added_cards: ready.reduce((n, c) => n + c.quantity, 0),
    skipped_captures: skipped,
    wishlist_matches: matches,
    wishlist_auto_removed: autoRemoved,
  };
}
