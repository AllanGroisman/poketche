import { CatalogHttpError, type HttpJson } from './http.js';
import type { CatalogTranslation } from './types.js';

/**
 * Cliente TCGdex — tradução PT. As edições são casadas às canônicas (pokemontcg.io) por
 * um resolvedor de IDs, já que as duas fontes usam esquemas diferentes (ex.: `sv1` vs
 * `sv01`): exact → id normalizado → contagem de cartas única. Best-effort: sem match a
 * carta fica só com EN (fallback FR-011). Os mapeadores são puros, testados por fixtures.
 */

const DEFAULT_BASE_URL = 'https://api.tcgdex.net/v2';

// --- Formas cruas (apenas os campos usados) ---
interface RawTcgdexCard {
  id: string;
  localId: string | number;
  name: string;
  image?: string; // base URL sem extensão; sufixo `/high.png` | `/low.png`
}
interface RawTcgdexSet {
  id: string;
  name: string;
  cards?: RawTcgdexCard[];
}
interface RawTcgdexSetBrief {
  id: string;
  cardCount?: { total?: number };
}

/** TCGdex serve `${image}/${quality}.${ext}`; null quando a carta não tem imagem. */
export function tcgdexImageUrls(
  image: string | undefined,
): { small: string; large: string } | null {
  if (!image) return null;
  const base = image.replace(/\/$/, '');
  return { small: `${base}/low.png`, large: `${base}/high.png` };
}

/** localId pode vir número ou string; normaliza para a string usada como `number`. */
export function normalizeLocalId(localId: string | number): string {
  return String(localId);
}

/**
 * Normaliza IDs de edição para casar esquemas diferentes: minúsculas, só alfanumérico/ponto,
 * e remoção do zero-padding numérico (`sv01` → `sv1`, `swsh03` → `swsh3`).
 */
export function normalizeSetId(id: string): string {
  return id
    .toLowerCase()
    .replace(/[^a-z0-9.]/g, '')
    .replace(/([a-z])0+(\d)/g, '$1$2');
}

/** Constrói o mapa número→tradução PT a partir da resposta de uma edição TCGdex. */
export function buildPtTranslations(rawSet: RawTcgdexSet): Map<string, CatalogTranslation> {
  const out = new Map<string, CatalogTranslation>();
  for (const card of rawSet.cards ?? []) {
    const urls = tcgdexImageUrls(card.image);
    if (!urls) continue; // sem imagem → não há como armazenar a tradução
    out.set(normalizeLocalId(card.localId), {
      language: 'pt',
      name: card.name,
      imageSmallUrl: urls.small,
      imageLargeUrl: urls.large,
      source: 'tcgdex',
    });
  }
  return out;
}

interface SetIndex {
  exact: Set<string>;
  byNorm: Map<string, string>;
  byTotal: Map<number, string[]>;
}

/** Resolvedor puro de ID: exact → id normalizado → contagem única. null se ambíguo/ausente. */
export function resolveTcgdexSetId(
  index: SetIndex,
  pokemonSetId: string,
  totalCards: number,
): string | null {
  if (index.exact.has(pokemonSetId)) return pokemonSetId;
  const byNorm = index.byNorm.get(normalizeSetId(pokemonSetId));
  if (byNorm) return byNorm;
  const byTotal = index.byTotal.get(totalCards);
  if (byTotal && byTotal.length === 1) return byTotal[0] ?? null;
  return null;
}

export function buildSetIndex(sets: RawTcgdexSetBrief[]): SetIndex {
  const exact = new Set<string>();
  const byNorm = new Map<string, string>();
  const byTotal = new Map<number, string[]>();
  for (const s of sets) {
    exact.add(s.id);
    // Primeiro id vence em colisão de normalização (determinístico pela ordem da fonte).
    const n = normalizeSetId(s.id);
    if (!byNorm.has(n)) byNorm.set(n, s.id);
    const total = s.cardCount?.total;
    if (total != null) {
      const arr = byTotal.get(total) ?? [];
      arr.push(s.id);
      byTotal.set(total, arr);
    }
  }
  return { exact, byNorm, byTotal };
}

export class TcgdexClient {
  private readonly baseUrl: string;
  private indexPromise?: Promise<SetIndex>;

  constructor(
    private readonly http: HttpJson,
    opts: { baseUrl?: string } = {},
  ) {
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
  }

  private loadIndex(): Promise<SetIndex> {
    this.indexPromise ??= (async () => {
      const sets = (await this.http(`${this.baseUrl}/pt/sets`)) as RawTcgdexSetBrief[];
      return buildSetIndex(sets);
    })();
    return this.indexPromise;
  }

  /**
   * Traduções PT da edição, indexadas por número. Vazio se não houver edição PT
   * correspondente (comum em sets antigos sem lançamento em português).
   */
  async ptTranslationsForSet(
    pokemonSetId: string,
    totalCards: number,
  ): Promise<Map<string, CatalogTranslation>> {
    const index = await this.loadIndex();
    const tcgdexId = resolveTcgdexSetId(index, pokemonSetId, totalCards);
    if (!tcgdexId) return new Map();
    try {
      const raw = (await this.http(
        `${this.baseUrl}/pt/sets/${encodeURIComponent(tcgdexId)}`,
      )) as RawTcgdexSet;
      return buildPtTranslations(raw);
    } catch (err) {
      if (err instanceof CatalogHttpError && err.status === 404) return new Map();
      throw err;
    }
  }
}
