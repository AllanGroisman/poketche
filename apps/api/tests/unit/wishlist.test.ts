import { describe, expect, it } from 'vitest';
import {
  evaluateAlerts,
  type AlertCandidate,
  type AlertPrice,
} from '../../src/modules/wishlist/alerts.js';
import { selectWishlistPrice, type PriceLike } from '../../src/modules/pricing/current.js';

/**
 * Testes de unidade da US9 (T064): regras de rearme, intervalo mínimo, oscilação e seleção da
 * cotação entre variantes. Notificação é dinheiro na tela do usuário — a lógica é pura e
 * coberta obrigatoriamente (constituição I).
 */

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const NOW = new Date('2026-07-16T12:00:00Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms);

const candidate = (over: Partial<AlertCandidate> = {}): AlertCandidate => ({
  itemId: 'item-1',
  wishlistId: 'wl-1',
  cardId: 'card-1',
  targetPriceCents: 10_000,
  alertState: 'armed',
  lastNotifiedAt: null,
  notificationsEnabled: true,
  ...over,
});

const priced = (cents: number, cardId = 'card-1'): Map<string, AlertPrice> =>
  new Map([[cardId, { priceCents: cents, variant: 'normal' as const }]]);

const evaluate = (candidates: AlertCandidate[], prices: Map<string, AlertPrice>) =>
  evaluateAlerts(candidates, prices, { now: NOW, minIntervalMs: DAY });

describe('evaluateAlerts — alvo atingido (FR-046)', () => {
  it('notifica quando o preço fica abaixo do alvo', () => {
    const { decisions, notifications } = evaluate([candidate()], priced(9_000));
    expect(decisions[0]).toMatchObject({ action: 'notify', nextState: 'notified' });
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({
      cardId: 'card-1',
      priceCents: 9_000,
      targetPriceCents: 10_000,
      itemIds: ['item-1'],
    });
  });

  it('notifica no limite: preço igual ao alvo conta como atingido', () => {
    const { decisions } = evaluate([candidate()], priced(10_000));
    expect(decisions[0]?.action).toBe('notify');
  });

  it('não notifica com o preço acima do alvo', () => {
    const { decisions, notifications } = evaluate([candidate()], priced(10_001));
    expect(decisions[0]).toMatchObject({ action: 'none' });
    expect(notifications).toHaveLength(0);
  });
});

describe('evaluateAlerts — rearme e repetição (FR-047)', () => {
  it('não repete enquanto o preço segue abaixo do alvo (cenário 4)', () => {
    // Já notificado ontem; o preço continua abaixo. Mesmo com o intervalo de 24h vencido,
    // só o rearme volta a notificar — senão o ciclo diário viraria um push por dia.
    const { decisions, notifications } = evaluate(
      [candidate({ alertState: 'notified', lastNotifiedAt: ago(30 * HOUR) })],
      priced(9_000),
    );
    expect(decisions[0]).toMatchObject({ action: 'none', nextState: 'notified' });
    expect(notifications).toHaveLength(0);
  });

  it('rearma quando o preço sobe acima do alvo', () => {
    const { decisions } = evaluate(
      [candidate({ alertState: 'notified', lastNotifiedAt: ago(2 * HOUR) })],
      priced(12_000),
    );
    expect(decisions[0]).toMatchObject({ action: 'rearm', nextState: 'armed' });
  });

  it('rearmado + intervalo vencido → notifica na próxima queda', () => {
    const { decisions } = evaluate(
      [candidate({ alertState: 'armed', lastNotifiedAt: ago(30 * HOUR) })],
      priced(9_000),
    );
    expect(decisions[0]).toMatchObject({ action: 'notify', nextState: 'notified' });
  });

  it('oscilação: rearmado mas dentro do intervalo mínimo → sem push', () => {
    // Subiu e caiu no mesmo dia. Sem o piso de 24h, cada cruzada do alvo viraria notificação.
    const { decisions, notifications } = evaluate(
      [candidate({ alertState: 'armed', lastNotifiedAt: ago(2 * HOUR) })],
      priced(9_000),
    );
    expect(decisions[0]).toMatchObject({ action: 'none' });
    expect(notifications).toHaveLength(0);
  });

  it('rearme acontece mesmo com notificações desligadas (FR-048)', () => {
    // O toggle silencia o envio, não a máquina de estados: senão o item ficaria preso em
    // `notified` e não notificaria mais nada ao religar.
    const { decisions } = evaluate(
      [
        candidate({
          alertState: 'notified',
          lastNotifiedAt: ago(2 * DAY),
          notificationsEnabled: false,
        }),
      ],
      priced(12_000),
    );
    expect(decisions[0]).toMatchObject({ action: 'rearm', nextState: 'armed' });
  });
});

describe('evaluateAlerts — toggles e ausência de cotação (FR-048/FR-049)', () => {
  it('notificações desligadas: alvo atingido não gera push nem transição', () => {
    const { decisions, notifications } = evaluate(
      [candidate({ notificationsEnabled: false })],
      priced(9_000),
    );
    expect(decisions[0]).toMatchObject({ action: 'none', nextState: 'armed' });
    expect(notifications).toHaveLength(0);
  });

  it('carta sem cotação não notifica nem muda estado', () => {
    const { decisions, notifications } = evaluate([candidate()], new Map());
    expect(decisions[0]).toMatchObject({ action: 'none', nextState: 'armed', price: null });
    expect(notifications).toHaveLength(0);
  });
});

describe('evaluateAlerts — uma notificação por carta por evento (FR-046)', () => {
  it('mesma carta em duas wishlists → 1 push, mas os dois itens marcados', () => {
    const { decisions, notifications } = evaluate(
      [
        candidate({ itemId: 'a', wishlistId: 'wl-1', targetPriceCents: 10_000 }),
        candidate({ itemId: 'b', wishlistId: 'wl-2', targetPriceCents: 11_000 }),
      ],
      priced(9_000),
    );
    expect(notifications).toHaveLength(1);
    expect(notifications[0]?.itemIds).toEqual(['a', 'b']);
    // O alvo exibido é o mais generoso — foi ele que a queda satisfez primeiro.
    expect(notifications[0]?.targetPriceCents).toBe(11_000);
    // Marcar ambos é o que impede a outra lista de re-notificar a mesma queda amanhã.
    expect(decisions.every((d) => d.action === 'notify')).toBe(true);
  });

  it('cartas distintas geram pushes distintos', () => {
    const prices = new Map<string, AlertPrice>([
      ['card-1', { priceCents: 9_000, variant: 'normal' }],
      ['card-2', { priceCents: 5_000, variant: 'holo' }],
    ]);
    const { notifications } = evaluate(
      [candidate({ itemId: 'a' }), candidate({ itemId: 'b', cardId: 'card-2' })],
      prices,
    );
    expect(notifications).toHaveLength(2);
  });

  it('uma wishlist silenciada não impede o push pela outra que casou', () => {
    const { notifications } = evaluate(
      [
        candidate({ itemId: 'a', wishlistId: 'wl-1', notificationsEnabled: false }),
        candidate({ itemId: 'b', wishlistId: 'wl-2', notificationsEnabled: true }),
      ],
      priced(9_000),
    );
    expect(notifications).toHaveLength(1);
    expect(notifications[0]?.itemIds).toEqual(['b']);
  });
});

describe('selectWishlistPrice — menor cotação entre variantes (data-model §Wishlists)', () => {
  const price = (over: Partial<PriceLike>): PriceLike => ({
    condition: null,
    variant: 'normal',
    priceCents: 10_000,
    source: 'intl_usd_fx',
    fxRate: null,
    fetchedAt: NOW,
    ...over,
  });

  it('escolhe a variante mais barata e informa qual é', () => {
    const chosen = selectWishlistPrice([
      price({ variant: 'normal', priceCents: 10_000 }),
      price({ variant: 'reverse_foil', priceCents: 4_000 }),
      price({ variant: 'holo', priceCents: 7_000 }),
    ]);
    expect(chosen).toMatchObject({ variant: 'reverse_foil', priceCents: 4_000 });
  });

  it('dentro da variante, a fonte primária vence — mesmo sendo mais cara', () => {
    // O alvo tem de enfrentar o preço que o app exibe. Pegar o intl só por ser mais barato
    // notificaria um número que o usuário não vê em lugar nenhum.
    const chosen = selectWishlistPrice([
      price({ variant: 'normal', priceCents: 9_000, source: 'intl_usd_fx' }),
      price({ variant: 'normal', priceCents: 11_000, source: 'liga_pokemon' }),
    ]);
    expect(chosen).toMatchObject({ source: 'liga_pokemon', priceCents: 11_000 });
  });

  it('compara entre variantes já com a fonte preferida de cada uma', () => {
    const chosen = selectWishlistPrice([
      price({ variant: 'normal', priceCents: 11_000, source: 'liga_pokemon' }),
      price({ variant: 'normal', priceCents: 3_000, source: 'intl_usd_fx' }),
      price({ variant: 'holo', priceCents: 8_000, source: 'liga_pokemon' }),
    ]);
    // normal resolve para 11.000 (Liga); holo, 8.000 → holo é a mais barata de verdade.
    expect(chosen).toMatchObject({ variant: 'holo', priceCents: 8_000 });
  });

  it('empate de preço resolve pela ordem usual de negociação', () => {
    const chosen = selectWishlistPrice([
      price({ variant: 'reverse_foil', priceCents: 5_000 }),
      price({ variant: 'normal', priceCents: 5_000 }),
    ]);
    expect(chosen?.variant).toBe('normal');
  });

  it('sem cotação alguma → null (FR-049)', () => {
    expect(selectWishlistPrice([])).toBeNull();
  });
});
