import type { PrismaClient } from '@prisma/client';

/**
 * Pergunta de remoção ao adquirir uma carta que está em wishlist (US9 — FR-051/FR-052).
 *
 * FR-052 vale "por qualquer método (manual, scanner ou compra no marketplace)", por isso a regra
 * mora aqui e não dentro do POST da coleção: o `confirm` do scanner (US5, FR-058) e a conclusão
 * de compra (US6) chamam a mesma função. Duplicá-la seria deixar os três caminhos divergirem.
 *
 * O servidor nunca decide sozinho remover, exceto quando o usuário ligou `wishlist_auto_remove`
 * no perfil: sem a flag, devolve os casamentos e **quem pergunta é o app**.
 */

export interface WishlistMatch {
  wishlist_id: string;
  wishlist_name: string;
  item_id: string;
  target_price_cents: number | null;
  /** `true` quando a auto-remoção estava ligada e o item já saiu da lista. */
  removed: boolean;
}

export interface WishlistMatchResult {
  matches: WishlistMatch[];
  /** Espelha a preferência aplicada — o app usa para perguntar ou só informar. */
  auto_removed: boolean;
}

export async function resolveWishlistMatches(
  prisma: PrismaClient,
  userId: string,
  cardId: string,
): Promise<WishlistMatchResult> {
  const items = await prisma.wishlistItem.findMany({
    where: { cardId, wishlist: { userId } },
    include: { wishlist: { select: { id: true, name: true } } },
  });
  if (items.length === 0) return { matches: [], auto_removed: false };

  const profile = await prisma.userProfile.findUnique({
    where: { id: userId },
    select: { wishlistAutoRemove: true },
  });
  const autoRemove = profile?.wishlistAutoRemove ?? false;

  if (autoRemove) {
    await prisma.wishlistItem.deleteMany({ where: { id: { in: items.map((i) => i.id) } } });
  }

  return {
    auto_removed: autoRemove,
    matches: items.map((i) => ({
      wishlist_id: i.wishlist.id,
      wishlist_name: i.wishlist.name,
      item_id: i.id,
      target_price_cents: i.targetPriceCents,
      removed: autoRemove,
    })),
  };
}
