import { describe, expect, it, vi } from 'vitest';
import type { HttpJson } from '../../src/integrations/catalog/http.js';
import {
  mapPokemonCard,
  mapPokemonSet,
  normalizeReleaseDate,
  PokemonTcgClient,
} from '../../src/integrations/catalog/pokemontcgio.js';
import {
  buildPtTranslations,
  buildSetIndex,
  normalizeLocalId,
  normalizeSetId,
  resolveTcgdexSetId,
  tcgdexImageUrls,
} from '../../src/integrations/catalog/tcgdex.js';
import { mergePtTranslations } from '../../src/integrations/catalog/provider.js';
import type { CatalogCard, CatalogTranslation } from '../../src/integrations/catalog/types.js';

// ---------- Fixtures (subconjunto real das APIs) ----------

const RAW_SET = {
  id: 'swsh3',
  name: 'Darkness Ablaze',
  series: 'Sword & Shield',
  total: 201,
  printedTotal: 189,
  releaseDate: '2020/08/14',
  images: { logo: 'https://images.pokemontcg.io/swsh3/logo.png' },
};

const RAW_CARD = {
  id: 'swsh3-1',
  name: 'Butterfree',
  number: '1',
  rarity: 'Rare',
  supertype: 'Pokémon',
  subtypes: ['Stage 2'],
  types: ['Grass'],
  set: { id: 'swsh3' },
  images: {
    small: 'https://images.pokemontcg.io/swsh3/1.png',
    large: 'https://images.pokemontcg.io/swsh3/1_hires.png',
  },
};

const RAW_CARD_NO_IMAGE = { ...RAW_CARD, id: 'swsh3-2', number: '2', images: {} };

const RAW_TCGDEX_SET = {
  id: 'swsh3',
  name: 'Escuridão Incandescente',
  cards: [
    {
      id: 'swsh3-1',
      localId: '1',
      name: 'Butterfree',
      image: 'https://assets.tcgdex.net/pt/swsh/swsh3/1',
    },
    {
      id: 'swsh3-2',
      localId: 2,
      name: 'Caterpie',
      image: 'https://assets.tcgdex.net/pt/swsh/swsh3/2',
    },
    { id: 'swsh3-3', localId: '3', name: 'SemImagem' }, // sem imagem → ignorada
  ],
};

// ---------- pokemontcg.io (canônico EN) ----------

describe('pokemontcg.io mappers', () => {
  it('normaliza releaseDate YYYY/MM/DD → ISO', () => {
    expect(normalizeReleaseDate('2020/08/14')).toBe('2020-08-14');
    expect(normalizeReleaseDate(undefined)).toBeNull();
    expect(normalizeReleaseDate('invalida')).toBeNull();
  });

  it('mapeia edição para a forma normalizada', () => {
    expect(mapPokemonSet(RAW_SET)).toEqual({
      externalId: 'swsh3',
      name: 'Darkness Ablaze',
      series: 'Sword & Shield',
      totalCards: 201,
      releaseDate: '2020-08-14',
      logoUrl: 'https://images.pokemontcg.io/swsh3/logo.png',
    });
  });

  it('mapeia carta EN com tradução e imagens', () => {
    const card = mapPokemonCard(RAW_CARD);
    expect(card).not.toBeNull();
    expect(card?.externalId).toBe('swsh3-1');
    expect(card?.setExternalId).toBe('swsh3');
    expect(card?.number).toBe('1');
    expect(card?.translations).toEqual([
      {
        language: 'en',
        name: 'Butterfree',
        imageSmallUrl: 'https://images.pokemontcg.io/swsh3/1.png',
        imageLargeUrl: 'https://images.pokemontcg.io/swsh3/1_hires.png',
        source: 'pokemontcgio',
      },
    ]);
  });

  it('descarta carta sem imagem (schema exige imagem na tradução)', () => {
    expect(mapPokemonCard(RAW_CARD_NO_IMAGE)).toBeNull();
  });
});

describe('PokemonTcgClient paginação', () => {
  it('percorre todas as páginas até a última incompleta', async () => {
    const pageSize = 250;
    const full = Array.from({ length: pageSize }, (_, i) => ({
      ...RAW_CARD,
      id: `swsh3-${i + 1}`,
      number: String(i + 1),
    }));
    const http: HttpJson = vi.fn(async (url: string) => {
      if (url.includes('page=1'))
        return { data: full, page: 1, pageSize, count: pageSize, totalCount: 251 };
      return { data: [RAW_CARD], page: 2, pageSize, count: 1, totalCount: 251 };
    });
    const client = new PokemonTcgClient(http, { apiKey: 'k' });
    const cards = await client.listCardsBySet('swsh3');
    expect(cards).toHaveLength(pageSize + 1);
    expect(http).toHaveBeenCalledTimes(2);
  });

  it('envia X-Api-Key quando há chave', async () => {
    const http = vi.fn(async () => ({ data: [], page: 1, pageSize: 250, count: 0, totalCount: 0 }));
    await new PokemonTcgClient(http, { apiKey: 'segredo' }).listSets();
    expect(http).toHaveBeenCalledWith(expect.stringContaining('/sets'), { 'X-Api-Key': 'segredo' });
  });
});

// ---------- TCGdex (PT) ----------

describe('TCGdex mappers', () => {
  it('constrói URLs low/high a partir do base', () => {
    expect(tcgdexImageUrls('https://assets.tcgdex.net/pt/swsh/swsh3/1')).toEqual({
      small: 'https://assets.tcgdex.net/pt/swsh/swsh3/1/low.png',
      large: 'https://assets.tcgdex.net/pt/swsh/swsh3/1/high.png',
    });
    expect(tcgdexImageUrls(undefined)).toBeNull();
  });

  it('normaliza localId número ou string', () => {
    expect(normalizeLocalId(2)).toBe('2');
    expect(normalizeLocalId('2')).toBe('2');
  });

  it('indexa traduções PT por número, ignorando sem imagem', () => {
    const map = buildPtTranslations(RAW_TCGDEX_SET);
    expect([...map.keys()].sort()).toEqual(['1', '2']);
    expect(map.get('1')).toEqual({
      language: 'pt',
      name: 'Butterfree',
      imageSmallUrl: 'https://assets.tcgdex.net/pt/swsh/swsh3/1/low.png',
      imageLargeUrl: 'https://assets.tcgdex.net/pt/swsh/swsh3/1/high.png',
      source: 'tcgdex',
    });
  });
});

describe('resolvedor de edição TCGdex', () => {
  const index = buildSetIndex([
    { id: 'base1', cardCount: { total: 102 } },
    { id: 'sv01', cardCount: { total: 258 } },
    { id: 'sv02', cardCount: { total: 279 } },
    { id: 'colA', cardCount: { total: 100 } },
    { id: 'colB', cardCount: { total: 100 } }, // total colidente
  ]);

  it('normaliza IDs removendo zero-padding', () => {
    expect(normalizeSetId('sv01')).toBe('sv1');
    expect(normalizeSetId('SWSH03')).toBe('swsh3');
    expect(normalizeSetId('base1')).toBe('base1');
  });

  it('casa por id exato', () => {
    expect(resolveTcgdexSetId(index, 'base1', 102)).toBe('base1');
  });

  it('casa por id normalizado (sv1 → sv01)', () => {
    expect(resolveTcgdexSetId(index, 'sv1', 258)).toBe('sv01');
  });

  it('cai para contagem única quando o id não bate', () => {
    expect(resolveTcgdexSetId(index, 'desconhecido', 279)).toBe('sv02');
  });

  it('retorna null quando a contagem é ambígua e o id não bate', () => {
    expect(resolveTcgdexSetId(index, 'desconhecido', 100)).toBeNull();
  });
});

// ---------- merge ----------

describe('mergePtTranslations', () => {
  const en = mapPokemonCard(RAW_CARD) as CatalogCard;
  const enOnly: CatalogCard = { ...en, externalId: 'swsh3-9', number: '9' };

  it('anexa PT à carta com número correspondente, EN primeiro', () => {
    const pt: CatalogTranslation = {
      language: 'pt',
      name: 'Butterfree',
      imageSmallUrl: 'x/low.png',
      imageLargeUrl: 'x/high.png',
      source: 'tcgdex',
    };
    const merged = mergePtTranslations([en, enOnly], new Map([['1', pt]]));
    expect(merged[0]?.translations.map((t) => t.language)).toEqual(['en', 'pt']);
    expect(merged[1]?.translations.map((t) => t.language)).toEqual(['en']); // sem match
  });

  it('sem traduções PT retorna as cartas EN inalteradas', () => {
    const merged = mergePtTranslations([en], new Map());
    expect(merged[0]).toBe(en);
  });
});
