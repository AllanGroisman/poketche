import type { Variant, WishlistAlertState } from '@prisma/client';

/**
 * Regras de alerta de preço-alvo (US9 — T063, FR-046/FR-047/FR-048/FR-049). Lógica **pura**:
 * o job (`jobs/wishlist-alerts.ts`) carrega o estado, chama `evaluateAlerts` e aplica o
 * resultado. Testes obrigatórios em tests/unit/wishlist.test.ts.
 *
 * Decisões que o cálculo encapsula:
 *
 *  - **Sem cotação, sem alerta** (FR-049): carta sem preço vigente não notifica nem muda estado
 *    — "preço indisponível" é só exibição.
 *  - **Rearme independe do toggle** (FR-047/FR-048): quando o preço sobe acima do alvo, o item
 *    volta a `armed` mesmo com as notificações desligadas. O toggle silencia o envio, não a
 *    máquina de estados — senão desligar e religar deixaria o item preso em `notified`, sem
 *    nunca mais notificar. Os indicadores das telas são calculados ao vivo (preço vs. alvo) e
 *    não dependem de `alert_state`, então nada disso afeta o visual (FR-048).
 *  - **Uma notificação por carta por evento** (FR-046): a mesma carta em várias wishlists do
 *    usuário marca todos os itens como `notified`, mas gera **um** push. Marcar todos é o que
 *    impede a mesma queda de re-notificar pelas outras listas no ciclo seguinte.
 *  - **Intervalo mínimo** (FR-047): ver `minIntervalMs` abaixo.
 */

export type AlertAction = 'notify' | 'rearm' | 'none';

/** Item de wishlist com alvo definido — itens sem alvo não entram na avaliação (FR-045). */
export interface AlertCandidate {
  itemId: string;
  wishlistId: string;
  cardId: string;
  targetPriceCents: number;
  alertState: WishlistAlertState;
  lastNotifiedAt: Date | null;
  /** Toggle da wishlist **e** global já resolvidos pelo chamador (FR-048). */
  notificationsEnabled: boolean;
}

/** Cotação vigente que o alvo enfrenta — `selectWishlistPrice` (menor entre as variantes). */
export interface AlertPrice {
  priceCents: number;
  variant: Variant;
}

export interface AlertDecision {
  itemId: string;
  cardId: string;
  action: AlertAction;
  /** Estado resultante; igual ao atual quando `action === 'none'`. */
  nextState: WishlistAlertState;
  /** Preço que disparou a decisão — presente quando há cotação. */
  price: AlertPrice | null;
}

/** Um push por carta (FR-046), com o preço/variante que atingiu o alvo. */
export interface AlertNotification {
  cardId: string;
  priceCents: number;
  variant: Variant;
  targetPriceCents: number;
  /** Todos os itens que a notificação cobre — o job os marca como `notified`. */
  itemIds: string[];
}

export interface EvaluateAlertsOptions {
  now: Date;
  /**
   * Piso de tempo entre dois pushes da mesma carta (FR-047, `WISHLIST_ALERT_MIN_INTERVAL_HOURS`).
   *
   * Guarda contra **oscilação**: sem ele, um preço que cruza o alvo para cima e para baixo no
   * mesmo dia rearmaria e notificaria a cada ciclo. O intervalo é uma condição **adicional** ao
   * rearme, não um gatilho paralelo — ver a nota sobre FR-047 no cabeçalho de `evaluateAlerts`.
   */
  minIntervalMs: number;
}

export interface EvaluateAlertsResult {
  decisions: AlertDecision[];
  notifications: AlertNotification[];
}

/**
 * Avalia os itens com alvo de **um usuário** contra as cotações vigentes.
 * `pricesByCard` traz a cotação já selecionada por carta (ausente = sem cotação).
 *
 * **Condição de notificação**: `alert_state === 'armed'` **e** intervalo mínimo decorrido.
 *
 * FR-047 diz "volta a notificar somente se o preço subir acima do alvo e cair novamente (rearme)
 * **ou** após o intervalo mínimo configurado", o que lido ao pé da letra faria o intervalo ser um
 * gatilho paralelo — carta parada abaixo do alvo notificando a cada intervalo, sem rearme. Não é
 * o desenho pretendido, por três razões: (1) o `price-refresh` roda diariamente e o intervalo
 * especificado é de 24h (T063), então o gatilho paralelo mandaria um push por dia por carta —
 * exatamente as "notificações repetidas" que o próprio FR-047 manda evitar, e o oposto da
 * primeira oração do cenário 4 ("o preço permanece abaixo do alvo → nenhuma nova notificação");
 * (2) T063 descreve as duas regras como "rearme **+** intervalo mínimo"; (3) o gatilho paralelo
 * tornaria `alert_state` (que o data-model exige) inerte, já que só `last_notified_at` decidiria.
 * Tratamos o intervalo como condição adicional — o rearme é o único gatilho. A redação do FR-047
 * merece correção na spec.
 */
export function evaluateAlerts(
  candidates: AlertCandidate[],
  pricesByCard: Map<string, AlertPrice>,
  options: EvaluateAlertsOptions,
): EvaluateAlertsResult {
  const decisions: AlertDecision[] = [];
  const byCard = new Map<string, AlertNotification>();

  for (const c of candidates) {
    const price = pricesByCard.get(c.cardId) ?? null;

    // Sem cotação: nada a decidir (FR-049).
    if (!price) {
      decisions.push({
        itemId: c.itemId,
        cardId: c.cardId,
        action: 'none',
        nextState: c.alertState,
        price: null,
      });
      continue;
    }

    const reached = price.priceCents <= c.targetPriceCents;

    // Preço acima do alvo: rearma quem já notificou (FR-047) — independe do toggle.
    if (!reached) {
      const rearm = c.alertState === 'notified';
      decisions.push({
        itemId: c.itemId,
        cardId: c.cardId,
        action: rearm ? 'rearm' : 'none',
        nextState: 'armed',
        price,
      });
      continue;
    }

    // Alvo atingido, mas silenciado: sem push e sem transição (FR-048).
    if (!c.notificationsEnabled) {
      decisions.push({
        itemId: c.itemId,
        cardId: c.cardId,
        action: 'none',
        nextState: c.alertState,
        price,
      });
      continue;
    }

    // Alvo atingido e armado: notifica se o intervalo mínimo desde o último push já passou.
    // `notified` só volta a notificar via rearme (preço acima do alvo em algum ciclo).
    const waited =
      c.lastNotifiedAt == null ||
      options.now.getTime() - c.lastNotifiedAt.getTime() >= options.minIntervalMs;
    const shouldNotify = c.alertState === 'armed' && waited;

    if (!shouldNotify) {
      decisions.push({
        itemId: c.itemId,
        cardId: c.cardId,
        action: 'none',
        nextState: c.alertState,
        price,
      });
      continue;
    }

    decisions.push({
      itemId: c.itemId,
      cardId: c.cardId,
      action: 'notify',
      nextState: 'notified',
      price,
    });

    // Dedupe por carta: um push cobrindo todos os itens do usuário naquela carta (FR-046).
    const existing = byCard.get(c.cardId);
    if (existing) {
      existing.itemIds.push(c.itemId);
      // O alvo exibido é o mais generoso entre as listas — foi o que a queda satisfez.
      existing.targetPriceCents = Math.max(existing.targetPriceCents, c.targetPriceCents);
    } else {
      byCard.set(c.cardId, {
        cardId: c.cardId,
        priceCents: price.priceCents,
        variant: price.variant,
        targetPriceCents: c.targetPriceCents,
        itemIds: [c.itemId],
      });
    }
  }

  return { decisions, notifications: [...byCard.values()] };
}
