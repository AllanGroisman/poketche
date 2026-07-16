import { Prisma, type PrismaClient } from '@prisma/client';
import type { CardCandidate } from './types.js';
import type { PrintedNumber } from './text.js';

/**
 * Resolução do texto lido contra o catálogo (T068). O fallback visual por phash ficou **fora do
 * MVP** (research.md §3): os candidatos do "a revisar" (FR-023/FR-060) saem da mesma busca trigram
 * que o autocomplete e o explorador já usam — `pg_trgm` e o índice GIN em `card_translation.name`
 * já existem, e a busca já cobre os nomes de todos os idiomas. Zero infra nova para cobrir a
 * revisão; quando a camada on-device entrar, o phash entra com ela.
 */

const MAX_CANDIDATES = 8;

/** Abaixo disso a similaridade é ruído — não vale ocupar a lista de revisão. */
const MIN_RANK = 0.2;

interface Row {
  card_id: string;
  name: string;
  number: string;
  set_name: string;
  language: string;
  rank: number;
}

/**
 * Confiança combinada. O número impresso é o sinal forte — junto com o nome, identifica a carta
 * unicamente; o nome sozinho não distingue os dezenas de Pikachus do catálogo. Por isso um acerto
 * só por nome **satura em 0.5** e nunca passa do limiar sozinho: cai em "a revisar" com os
 * candidatos, que é exatamente o comportamento que o FR-023 pede.
 */
export function scoreOf(nameRank: number, numberMatched: boolean): number {
  return numberMatched ? 0.5 + 0.5 * nameRank : 0.5 * nameRank;
}

function numberFilter(number: PrintedNumber): Prisma.Sql {
  // O catálogo guarda `25`, mas também `SWSH001` e `TG01`. Comparar numericamente quando ambos os
  // lados são numéricos (o índice de expressão em prisma/manual/0002 cobre exatamente isso) e
  // textualmente caso contrário.
  if (/^\d+$/.test(number.normalized)) {
    return Prisma.sql`NULLIF(regexp_replace(c.number, '\\D', '', 'g'), '')::int = ${Number(number.normalized)}`;
  }
  return Prisma.sql`upper(c.number) = ${number.normalized}`;
}

async function query(
  prisma: PrismaClient,
  names: string[],
  number: PrintedNumber | null,
): Promise<Row[]> {
  const rank = Prisma.sql`GREATEST(${Prisma.join(
    names.map((n) => Prisma.sql`similarity(ct.name, ${n})`),
    ', ',
  )})`;
  const where = number
    ? Prisma.sql`WHERE ${numberFilter(number)} AND ${rank} >= ${MIN_RANK}`
    : Prisma.sql`WHERE ${rank} >= ${MIN_RANK}`;

  return prisma.$queryRaw<Row[]>`
    SELECT c.id AS card_id, ct.name, c.number, s.name AS set_name,
           ct.language::text AS language, ${rank}::float AS rank
    FROM card c
    JOIN card_translation ct ON ct.card_id = c.id
    JOIN card_set s ON s.id = c.set_id
    ${where}
    ORDER BY rank DESC, c.number
    LIMIT ${MAX_CANDIDATES}
  `;
}

export interface LookupResult {
  candidates: CardCandidate[];
  numberMatched: boolean;
}

/**
 * Casa o texto lido com o catálogo. Estratégia em dois tempos: filtra pelo número quando ele foi
 * lido e, **se isso não devolver nada, repete só pelo nome**. O OCR erra número com frequência
 * (0/O, 1/7, brilho do foil), e um número mal lido não pode apagar a carta certa da tela de
 * revisão — o custo de errar aqui é uma consulta a mais, não uma carta perdida.
 */
export async function lookupCard(
  prisma: PrismaClient,
  names: string[],
  number: PrintedNumber | null,
): Promise<LookupResult> {
  if (names.length === 0) return { candidates: [], numberMatched: false };

  let numberMatched = number != null;
  let rows = await query(prisma, names, number);
  if (rows.length === 0 && number != null) {
    numberMatched = false;
    rows = await query(prisma, names, null);
  }

  return {
    candidates: rows.map((r) => ({
      cardId: r.card_id,
      name: r.name,
      number: r.number,
      setName: r.set_name,
      language: r.language as CardCandidate['language'],
      confidence: scoreOf(r.rank, numberMatched),
    })),
    numberMatched,
  };
}
