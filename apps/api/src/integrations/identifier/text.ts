/**
 * Parsing puro do texto lido pelo OCR (T068). Sem I/O e sem banco — é aqui que moram os casos
 * obrigatórios do spike T066, e por isso tudo aqui é testado unitariamente.
 *
 * Duas regras que o spike exigiu explicitamente:
 *
 *   - **Não assumir `NNN/MMM`**: promos como `SWSH001`, `XY-P` e subsets como `TG01/TG30` não têm
 *     numeração no padrão. O parse aceita o token com barra **ou** sozinho.
 *   - **Sem regiões fixas**: a posição e a tipografia do nome e do número mudam entre eras. Nada
 *     aqui recorta coordenadas — o OCR lê o crop inteiro e o catálogo decide qual linha é o nome
 *     (ver `catalog-lookup.ts`). É mais consultas, mas sobrevive a layout que ninguém previu.
 */

/** `025/165`, `TG01/TG30`, `H1/H32` — o lado esquerdo é o número da carta, o direito é o total. */
const WITH_TOTAL = /^([A-Za-z]{0,5}\d{1,4}[A-Za-z]?)\/([A-Za-z]{0,5}\d{1,4})$/;

/** `SWSH001`, `XYP` — promo sem total impresso. Exige prefixo alfabético para não casar com
 *  qualquer número solto da carta (dano, HP, ano de copyright). */
const PROMO = /^([A-Za-z]{2,6}-?\d{1,4})$/;

export interface PrintedNumber {
  /** Como aparece impresso, à esquerda da barra quando há barra. Ex.: `025`, `SWSH001`. */
  printed: string;
  /** Forma comparável ao `card.number` do catálogo. Ex.: `025` → `25`; `SWSH001` → `SWSH001`. */
  normalized: string;
  /** Total impresso à direita da barra, quando existe. Ex.: `165`. */
  total?: string;
}

/**
 * O catálogo guarda `card.number` sem zeros à esquerda quando é puramente numérico (`25`), mas
 * preserva a forma alfanumérica das promos (`SWSH001` — onde os zeros são significativos).
 */
export function normalizeNumber(printed: string): string {
  const digitsOnly = /^\d+$/.test(printed);
  if (digitsOnly) return String(parseInt(printed, 10));
  return printed.toUpperCase();
}

/**
 * Procura o número impresso entre as linhas lidas. Prefere o token com barra (sinal mais forte:
 * carta/total) e só cai no formato de promo se nenhum aparecer.
 */
export function parseCardNumber(lines: string[]): PrintedNumber | null {
  const tokens = lines.flatMap((l) => l.split(/\s+/)).filter(Boolean);

  for (const token of tokens) {
    const m = WITH_TOTAL.exec(token);
    const printed = m?.[1];
    if (printed) return { printed, normalized: normalizeNumber(printed), total: m?.[2] };
  }
  for (const token of tokens) {
    const printed = PROMO.exec(token)?.[1];
    if (printed) return { printed, normalized: normalizeNumber(printed) };
  }
  return null;
}

/**
 * Rodapé de copyright/ilustrador — testado na linha **crua**, antes da limpeza: os marcadores que
 * denunciam o rodapé (`©`, `TM`) são justamente os símbolos que a limpeza remove.
 */
const FOOTER = /©|\(c\)|\bTM\b|\bIllus\b|\bNintendo\b|\bCreatures\b|\bGAMEFREAK\b/i;

/**
 * Candidatas a nome da carta, melhor aposta primeiro. Não decide qual é o nome — só remove o que
 * seguramente não é e deixa o catálogo escolher por similaridade. O nome fica no topo em todas as
 * eras, então a ordem de leitura já é uma boa heurística de prioridade.
 *
 * `limit` existe porque cada candidata custa uma comparação por tradução no SQL: ler o crop
 * inteiro é barato, consultar o catálogo com 30 linhas não é.
 */
export function nameCandidates(lines: string[], limit = 5): string[] {
  const cleaned = lines
    .filter((l) => !FOOTER.test(l))
    .map((l) => l.replace(/[^\p{L}\p{N}\s'.-]/gu, ' ').trim())
    .map((l) => l.replace(/\s+/g, ' '))
    .filter((l) => l.length >= 3 && l.length <= 40)
    // Sobra alguma palavra de verdade? Descarta número solto (HP, dano, ano), pontuação e o que
    // era só numeração (`025/165` vira `025 165` na limpeza acima).
    .filter((l) => /\p{L}{3,}/u.test(l));

  return [...new Set(cleaned)].slice(0, limit);
}
