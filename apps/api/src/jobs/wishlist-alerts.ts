import type { PrismaClient } from '@prisma/client';
import type { PushMessage, PushProvider } from '../integrations/push/index.js';
import { formatBRL } from '../lib/money.js';
import { localize } from '../modules/catalog/localize.js';
import { selectWishlistPrice, type PriceLike } from '../modules/pricing/current.js';
import {
  evaluateAlerts,
  type AlertCandidate,
  type AlertPrice,
} from '../modules/wishlist/alerts.js';

/**
 * Job `wishlist-alerts` (T063, FR-046/FR-047/FR-050) — roda **após** o `price-refresh`: um
 * "evento" de alerta é um ciclo de cotações, então avaliar antes do refresh compararia o alvo
 * contra os preços de ontem.
 *
 * As regras de decisão são puras (`modules/wishlist/alerts.ts`); aqui ficam só o carregamento do
 * estado, o envio e a persistência. O envio é resiliente: se o push falhar, o estado **ainda
 * assim** é gravado — o alternativo seria re-notificar a mesma queda no ciclo seguinte.
 */

export interface WishlistAlertsDeps {
  prisma: PrismaClient;
  push: PushProvider;
  /** Intervalo mínimo entre pushes da mesma carta (FR-047). Default: 24h. */
  minIntervalMs?: number;
  logger?: { info: (msg: string) => void; warn?: (msg: string) => void };
}

export interface WishlistAlertsOptions {
  /** Restringe a um usuário (validação/dev); default: todos com alvo definido. */
  onlyUserId?: string;
  now?: Date;
}

export interface WishlistAlertsResult {
  usersProcessed: number;
  itemsEvaluated: number;
  notified: number;
  rearmed: number;
  pushesSent: number;
  pushesFailed: number;
  /** Usuários com alerta a enviar mas sem nenhum aparelho registrado. */
  usersWithoutToken: number;
}

export const DEFAULT_MIN_INTERVAL_MS = 24 * 60 * 60 * 1000;

export async function runWishlistAlerts(
  deps: WishlistAlertsDeps,
  options: WishlistAlertsOptions = {},
): Promise<WishlistAlertsResult> {
  const { prisma, push } = deps;
  const now = options.now ?? new Date();
  const minIntervalMs = deps.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS;

  const result: WishlistAlertsResult = {
    usersProcessed: 0,
    itemsEvaluated: 0,
    notified: 0,
    rearmed: 0,
    pushesSent: 0,
    pushesFailed: 0,
    usersWithoutToken: 0,
  };

  // Só itens com alvo entram: sem alvo não há o que atingir (FR-045).
  const items = await prisma.wishlistItem.findMany({
    where: {
      targetPriceCents: { not: null },
      wishlist: options.onlyUserId ? { userId: options.onlyUserId } : {},
    },
    include: {
      wishlist: {
        select: {
          id: true,
          userId: true,
          notificationsEnabled: true,
          user: { select: { notificationsEnabled: true } },
        },
      },
    },
  });
  if (items.length === 0) {
    deps.logger?.info('wishlist-alerts: nenhum item com preço-alvo');
    return result;
  }
  result.itemsEvaluated = items.length;

  // Cotações vigentes de todas as cartas desejadas, de uma vez (evita N+1 por usuário).
  const cardIds = [...new Set(items.map((i) => i.cardId))];
  const prices = await prisma.cardPrice.findMany({ where: { cardId: { in: cardIds } } });
  const pricesByCard = new Map<string, PriceLike[]>();
  for (const p of prices) {
    const acc = pricesByCard.get(p.cardId) ?? [];
    acc.push(p);
    pricesByCard.set(p.cardId, acc);
  }
  // O alvo enfrenta a menor cotação entre as variantes (data-model §Wishlists).
  const currentByCard = new Map<string, AlertPrice>();
  for (const cardId of cardIds) {
    const chosen = selectWishlistPrice(pricesByCard.get(cardId) ?? []);
    if (chosen)
      currentByCard.set(cardId, { priceCents: chosen.priceCents, variant: chosen.variant });
  }

  const byUser = new Map<string, typeof items>();
  for (const item of items) {
    const acc = byUser.get(item.wishlist.userId) ?? [];
    acc.push(item);
    byUser.set(item.wishlist.userId, acc);
  }

  const notifyIds: string[] = [];
  const rearmIds: string[] = [];
  const messages: PushMessage[] = [];

  for (const [userId, userItems] of byUser) {
    result.usersProcessed++;

    const candidates: AlertCandidate[] = userItems.map((i) => ({
      itemId: i.id,
      wishlistId: i.wishlistId,
      cardId: i.cardId,
      targetPriceCents: i.targetPriceCents!,
      alertState: i.alertState,
      lastNotifiedAt: i.lastNotifiedAt,
      // Toggle global do perfil E da wishlist (FR-048).
      notificationsEnabled: i.wishlist.user.notificationsEnabled && i.wishlist.notificationsEnabled,
    }));

    const { decisions, notifications } = evaluateAlerts(candidates, currentByCard, {
      now,
      minIntervalMs,
    });

    for (const d of decisions) {
      if (d.action === 'notify') notifyIds.push(d.itemId);
      // Rearme preserva `last_notified_at`: é ele que segura a oscilação dentro do intervalo.
      else if (d.action === 'rearm') rearmIds.push(d.itemId);
    }
    result.notified += notifications.length;

    if (notifications.length === 0) continue;

    const tokens = await prisma.pushToken.findMany({
      where: { userId },
      select: { expoToken: true },
    });
    if (tokens.length === 0) {
      // Sem aparelho registrado: o estado ainda avança (o indicador na tela já mostra o alvo
      // atingido); insistir a cada ciclo só geraria trabalho sem destino.
      result.usersWithoutToken++;
      continue;
    }

    const cards = await prisma.card.findMany({
      where: { id: { in: notifications.map((n) => n.cardId) } },
      select: { id: true, translations: { select: { id: true, language: true, name: true } } },
    });
    const nameByCard = new Map(
      cards.map((c) => [c.id, localize(c.translations, 'pt')?.name ?? '']),
    );

    // Anúncios ativos no alvo ou abaixo — destacados na notificação (FR-050). Enquanto a US6 não
    // existir isto vem vazio e a mensagem sai sem o complemento.
    const listings = await prisma.listing.findMany({
      where: {
        status: 'active',
        collectionItem: { cardId: { in: notifications.map((n) => n.cardId) } },
      },
      select: { priceCents: true, collectionItem: { select: { cardId: true } } },
    });
    const listingsByCard = new Map<string, number[]>();
    for (const l of listings) {
      const acc = listingsByCard.get(l.collectionItem.cardId) ?? [];
      acc.push(l.priceCents);
      listingsByCard.set(l.collectionItem.cardId, acc);
    }

    for (const n of notifications) {
      const name = nameByCard.get(n.cardId) || 'Carta';
      const offers = (listingsByCard.get(n.cardId) ?? []).filter(
        (p) => p <= n.targetPriceCents,
      ).length;
      const body =
        `${name} está por ${formatBRL(n.priceCents)} (alvo ${formatBRL(n.targetPriceCents)}).` +
        (offers > 0 ? ` ${offers} anúncio(s) no alvo ou abaixo.` : '');
      for (const t of tokens) {
        messages.push({
          to: t.expoToken,
          title: 'Preço-alvo atingido',
          body,
          data: {
            type: 'wishlist_alert',
            card_id: n.cardId,
            price_cents: n.priceCents,
            variant: n.variant,
            target_price_cents: n.targetPriceCents,
            listings_at_or_below_target: offers,
          },
        });
      }
    }
  }

  const send = await push.send(messages);
  result.pushesSent = send.sent;
  result.pushesFailed = send.failed;

  // Estado após o envio, mas gravado mesmo se o push falhar (ver cabeçalho).
  if (notifyIds.length) {
    await prisma.wishlistItem.updateMany({
      where: { id: { in: notifyIds } },
      data: { alertState: 'notified', lastNotifiedAt: now },
    });
  }
  if (rearmIds.length) {
    await prisma.wishlistItem.updateMany({
      where: { id: { in: rearmIds } },
      data: { alertState: 'armed' },
    });
  }
  result.rearmed = rearmIds.length;

  // Aparelhos que desinstalaram o app: o token não volta a funcionar.
  if (send.invalidTokens.length) {
    await prisma.pushToken.deleteMany({ where: { expoToken: { in: send.invalidTokens } } });
  }

  deps.logger?.info(
    `wishlist-alerts: ${result.notified} alvos atingidos, ${result.pushesSent} pushes ` +
      `(${result.pushesFailed} falhas), ${result.rearmed} rearmados — ${result.itemsEvaluated} itens`,
  );
  return result;
}
