/**
 * Dinheiro em PokeTche: SEMPRE centavos inteiros de BRL (constituição — Princípio IV).
 * Nunca usar float para armazenar/transacionar valores. Este módulo concentra as
 * conversões e os cálculos de pedido, com invariantes verificadas.
 */

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MoneyError';
  }
}

function assertIntCents(value: number, label: string): void {
  if (!Number.isInteger(value)) {
    throw new MoneyError(`${label} deve ser um inteiro em centavos, recebido: ${value}`);
  }
}

function assertNonNegative(value: number, label: string): void {
  assertIntCents(value, label);
  if (value < 0) {
    throw new MoneyError(`${label} não pode ser negativo, recebido: ${value}`);
  }
}

/** Converte reais (decimal) em centavos inteiros, arredondando ao centavo mais próximo. */
export function reaisToCents(reais: number): number {
  if (!Number.isFinite(reais)) {
    throw new MoneyError(`valor em reais inválido: ${reais}`);
  }
  return Math.round(reais * 100);
}

/** Formata centavos como moeda brasileira (ex.: 123456 → "R$ 1.234,56"). */
export function formatBRL(cents: number): string {
  assertIntCents(cents, 'valor');
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(cents / 100);
}

/** Valor de uma linha do pedido: preço unitário × quantidade. */
export function lineTotalCents(unitPriceCents: number, quantity: number): number {
  assertNonNegative(unitPriceCents, 'unitPriceCents');
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new MoneyError(`quantity deve ser inteiro positivo, recebido: ${quantity}`);
  }
  return unitPriceCents * quantity;
}

/**
 * Frete de um pedido que agrupa vários anúncios do mesmo vendedor (carrinho):
 * envio único = maior frete entre os anúncios (não soma). Assumption da spec.
 */
export function shippingForGroupCents(shippingPricesCents: number[]): number {
  if (shippingPricesCents.length === 0) return 0;
  shippingPricesCents.forEach((s) => assertNonNegative(s, 'shippingPriceCents'));
  return Math.max(...shippingPricesCents);
}

export interface OrderTotalsInput {
  /** Soma das linhas do pedido (itens do mesmo vendedor). */
  itemsTotalCents: number;
  /** Frete do pedido (0 = incluso no preço). */
  shippingPriceCents: number;
  /** Comissão da plataforma como fração (ex.: 0.1 = 10%). Incide só sobre os itens (FR-028). */
  commissionPct: number;
}

export interface OrderTotals {
  /** Cobrado do comprador e retido em custódia. */
  totalCents: number;
  /** Comissão da plataforma (sobre os itens). */
  commissionCents: number;
  /** Líquido liberado ao vendedor: itens − comissão + frete integral. */
  sellerNetCents: number;
}

/**
 * Calcula os valores congelados de um pedido garantindo as invariantes (SC-010):
 *   total = itens + frete
 *   net   = itens − comissão + frete
 * A comissão incide apenas sobre os itens; o frete é repassado integralmente.
 */
export function computeOrderTotals(input: OrderTotalsInput): OrderTotals {
  const { itemsTotalCents, shippingPriceCents, commissionPct } = input;
  assertNonNegative(itemsTotalCents, 'itemsTotalCents');
  assertNonNegative(shippingPriceCents, 'shippingPriceCents');
  if (!(commissionPct >= 0 && commissionPct < 1)) {
    throw new MoneyError(`commissionPct deve estar em [0, 1), recebido: ${commissionPct}`);
  }

  const commissionCents = Math.round(itemsTotalCents * commissionPct);
  const sellerNetCents = itemsTotalCents - commissionCents + shippingPriceCents;
  const totalCents = itemsTotalCents + shippingPriceCents;

  // Invariantes defensivas — nunca devem falhar; se falharem, é bug de cálculo.
  if (totalCents !== itemsTotalCents + shippingPriceCents) {
    throw new MoneyError('invariante de total violada');
  }
  if (sellerNetCents !== itemsTotalCents - commissionCents + shippingPriceCents) {
    throw new MoneyError('invariante de líquido do vendedor violada');
  }

  return { totalCents, commissionCents, sellerNetCents };
}
