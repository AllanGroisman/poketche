import type { HttpJson } from './http.js';
import type { CatalogCard, CatalogSet, CatalogTranslation } from './types.js';

/**
 * Cliente pokemontcg.io — fonte canônica (EN). Paginação interna; a API key (opcional)
 * eleva o rate limit. Os mapeadores são funções puras, testadas por fixtures (T016).
 */

const DEFAULT_BASE_URL = 'https://api.pokemontcg.io/v2';
const PAGE_SIZE = 250; // máximo aceito pela API

// --- Formas cruas (apenas os campos usados) ---
interface RawSet {
  id: string;
  name: string;
  series: string;
  total?: number;
  printedTotal?: number;
  releaseDate?: string; // "YYYY/MM/DD"
  images?: { logo?: string; symbol?: string };
}
interface RawCard {
  id: string;
  name: string;
  number: string;
  rarity?: string;
  supertype?: string;
  subtypes?: string[];
  types?: string[];
  set: { id: string };
  images?: { small?: string; large?: string };
}
interface Paged<T> {
  data: T[];
  page: number;
  pageSize: number;
  count: number;
  totalCount: number;
}

/** "YYYY/MM/DD" → "YYYY-MM-DD"; null se ausente/ inválido. */
export function normalizeReleaseDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const m = /^(\d{4})\/(\d{2})\/(\d{2})$/.exec(raw);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

export function mapPokemonSet(raw: RawSet): CatalogSet {
  return {
    externalId: raw.id,
    name: raw.name,
    series: raw.series,
    totalCards: raw.total ?? raw.printedTotal ?? 0,
    releaseDate: normalizeReleaseDate(raw.releaseDate),
    logoUrl: raw.images?.logo ?? null,
  };
}

/** Mapeia a carta EN. Retorna null se faltar imagem (tradução exige imagem no schema). */
export function mapPokemonCard(raw: RawCard): CatalogCard | null {
  const small = raw.images?.small;
  const large = raw.images?.large ?? raw.images?.small;
  if (!small || !large) return null;
  const en: CatalogTranslation = {
    language: 'en',
    name: raw.name,
    imageSmallUrl: small,
    imageLargeUrl: large,
    source: 'pokemontcgio',
  };
  return {
    externalId: raw.id,
    setExternalId: raw.set.id,
    number: raw.number,
    rarity: raw.rarity ?? 'Unknown',
    supertype: raw.supertype ?? 'Unknown',
    subtypes: raw.subtypes ?? [],
    types: raw.types ?? [],
    translations: [en],
  };
}

export class PokemonTcgClient {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;

  constructor(
    private readonly http: HttpJson,
    opts: { apiKey?: string; baseUrl?: string } = {},
  ) {
    this.baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
    this.headers = opts.apiKey ? { 'X-Api-Key': opts.apiKey } : {};
  }

  async listSets(): Promise<CatalogSet[]> {
    const out: CatalogSet[] = [];
    for (let page = 1; ; page++) {
      const res = (await this.http(
        `${this.baseUrl}/sets?page=${page}&pageSize=${PAGE_SIZE}`,
        this.headers,
      )) as Paged<RawSet>;
      out.push(...res.data.map(mapPokemonSet));
      if (res.data.length < PAGE_SIZE) break;
    }
    return out;
  }

  async listCardsBySet(setExternalId: string): Promise<CatalogCard[]> {
    const out: CatalogCard[] = [];
    const q = encodeURIComponent(`set.id:${setExternalId}`);
    for (let page = 1; ; page++) {
      const res = (await this.http(
        `${this.baseUrl}/cards?q=${q}&page=${page}&pageSize=${PAGE_SIZE}`,
        this.headers,
      )) as Paged<RawCard>;
      for (const raw of res.data) {
        const card = mapPokemonCard(raw);
        if (card) out.push(card);
      }
      if (res.data.length < PAGE_SIZE) break;
    }
    return out;
  }
}
