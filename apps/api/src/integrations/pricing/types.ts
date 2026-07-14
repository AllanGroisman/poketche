/**
 * Tipos normalizados da precificação (constituição V — isolamento de dados de terceiros).
 * Preços SEMPRE em centavos inteiros de BRL (constituição IV). As fontes externas (Liga
 * Pokémon BR, fonte internacional USD) são mapeadas para `PriceQuote` antes de tocar o
 * domínio; nenhum shape de terceiro vaza para além deste módulo.
 */
import type { Condition, PriceSource, Variant } from '@prisma/client';

export type { Condition, PriceSource, Variant };

/** Referência mínima de uma carta para consultar preço (id interno + id na fonte canônica). */
export interface PriceCardRef {
  cardId: string;
  externalId: string;
}

/** Cotação vigente normalizada em BRL, pronta para upsert em `card_price`. */
export interface PriceQuote {
  /** Variante precificada (fontes internacionais expõem normal/holo/reverse separadamente). */
  variant: Variant;
  /** Condição, quando a fonte diferencia; `null` quando não diferencia (ex.: fonte intl). */
  condition: Condition | null;
  /** Preço em centavos inteiros de BRL. */
  priceCents: number;
  source: PriceSource;
  /** Câmbio PTAX usado na conversão, quando a fonte é internacional; `null` na fonte BR. */
  fxRate: number | null;
  fetchedAt: Date;
}

/**
 * Contrato de uma fonte de preço isolada. `enabled` permite manter o coletor da Liga
 * pronto no código mas fora do ciclo até o parecer legal (T034). Cada provider resolve
 * as cotações de UMA carta; a resolução por carta (com fallback) fica no `PriceResolver`.
 */
export interface PriceProvider {
  readonly source: PriceSource;
  readonly enabled: boolean;
  /** Cotações vigentes da carta; array vazio = fonte sem preço para esta carta. */
  quotesFor(ref: PriceCardRef): Promise<PriceQuote[]>;
}

/** Câmbio USD→BRL (BRL por 1 USD). Injetável para teste; implementação PTAX/BACEN. */
export interface FxRateProvider {
  /** Cotação de venda do dólar na data (default: hoje), com walk-back em dias sem pregão. */
  usdToBrl(date?: Date): Promise<number>;
}

/** Preço bruto por variante em centavos de USD, extraído de uma fonte internacional. */
export interface RawUsdPrice {
  variant: Variant;
  priceUsdCents: number;
}

/** Fonte internacional: preços USD por carta (via id da fonte canônica). */
export interface InternationalPriceSource {
  usdPricesFor(externalId: string): Promise<RawUsdPrice[]>;
}
