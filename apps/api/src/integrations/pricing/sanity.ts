/**
 * Validação de sanidade de cotações (research §2): uma variação brusca em relação à última
 * cotação publicada marca o valor como **suspeito** — o job não publica e preserva a última
 * cotação, evitando que uma mudança de HTML na coleta ou um dado corrompido polua o preço.
 * Função pura, exercida pelos testes de dinheiro obrigatórios (constituição I).
 */

export interface SanityResult {
  ok: boolean;
  reason?: string;
}

/**
 * @param prevCents  última cotação publicada (mesma carta/condição/variante/fonte) ou null.
 * @param nextCents  novo valor candidato, em centavos inteiros de BRL.
 * @param maxFactor  fator máximo de variação tolerado (ex.: 5 = subir/cair até 5×).
 */
export function checkPriceSanity(
  prevCents: number | null,
  nextCents: number,
  maxFactor: number,
): SanityResult {
  if (!Number.isInteger(nextCents) || nextCents <= 0) {
    return { ok: false, reason: `valor inválido: ${nextCents}` };
  }
  // Sem baseline (primeira cotação) → aceita; a sanidade só compara contra histórico.
  if (prevCents == null || prevCents <= 0) return { ok: true };

  const factor = Math.max(nextCents / prevCents, prevCents / nextCents);
  if (factor > maxFactor) {
    return {
      ok: false,
      reason: `variação suspeita: ${prevCents}→${nextCents} (${factor.toFixed(1)}× > ${maxFactor}×)`,
    };
  }
  return { ok: true };
}
