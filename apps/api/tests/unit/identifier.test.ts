import { describe, expect, it } from 'vitest';
import {
  nameCandidates,
  normalizeNumber,
  parseCardNumber,
} from '../../src/integrations/identifier/text.js';
import { scoreOf } from '../../src/integrations/identifier/catalog-lookup.js';

/**
 * Parsing do OCR (T068). Os três primeiros describes são os **casos obrigatórios do spike T066**
 * (research.md §3): promos fora do padrão NNN/MMM, layouts antigos e reverse foil. São eles que
 * justificam o parse não assumir formato nem posição — e é por isso que ficam travados aqui.
 */

describe('parseCardNumber — numeração padrão NNN/MMM', () => {
  it('lê número e total, e normaliza os zeros à esquerda para a forma do catálogo', () => {
    // O catálogo guarda `25`, a carta imprime `025/165`.
    expect(parseCardNumber(['Pikachu', '025/165'])).toEqual({
      printed: '025',
      normalized: '25',
      total: '165',
    });
  });

  it('encontra o número em qualquer posição da leitura (o layout muda entre eras)', () => {
    const antigo = ['Base Set', 'Charizard', 'HP 120', '4/102', '© 1999 Nintendo'];
    expect(parseCardNumber(antigo)?.normalized).toBe('4');
  });

  it('aceita o número colado a outras palavras na mesma linha', () => {
    expect(parseCardNumber(['Illus. Mitsuhiro Arita 4/102'])?.normalized).toBe('4');
  });
});

describe('parseCardNumber — casos obrigatórios do T066', () => {
  it('promo sem barra: preserva os zeros significativos de SWSH001', () => {
    // Aqui os zeros NÃO podem cair: o catálogo guarda `SWSH001`, não `SWSH1`.
    expect(parseCardNumber(['Zacian V', 'SWSH001'])).toEqual({
      printed: 'SWSH001',
      normalized: 'SWSH001',
    });
  });

  it('subset com prefixo alfabético dos dois lados (TG01/TG30)', () => {
    expect(parseCardNumber(['Lugia', 'TG01/TG30'])).toEqual({
      printed: 'TG01',
      normalized: 'TG01',
      total: 'TG30',
    });
  });

  it('numeração antiga com prefixo de holo (H1/H32)', () => {
    expect(parseCardNumber(['Aerodactyl', 'H1/H32'])?.normalized).toBe('H1');
  });

  it('prefere o token com barra quando ambos os formatos aparecem', () => {
    // `SWSH001` casaria como promo, mas `025/165` é o sinal mais forte (carta/total).
    expect(parseCardNumber(['SWSH001', 'Pikachu', '025/165'])?.normalized).toBe('25');
  });

  it('não confunde números soltos da carta (HP, dano, ano) com numeração', () => {
    expect(parseCardNumber(['Pikachu', 'HP 60', '30', '© 1999'])).toBeNull();
  });

  it('devolve null quando o OCR não leu nada aproveitável', () => {
    expect(parseCardNumber([])).toBeNull();
  });
});

describe('normalizeNumber', () => {
  it('tira zeros à esquerda de número puramente numérico', () => {
    expect(normalizeNumber('025')).toBe('25');
    expect(normalizeNumber('4')).toBe('4');
  });

  it('preserva a forma alfanumérica das promos, em caixa alta', () => {
    expect(normalizeNumber('swsh001')).toBe('SWSH001');
    expect(normalizeNumber('TG01')).toBe('TG01');
  });
});

describe('nameCandidates', () => {
  it('mantém a ordem de leitura (o nome fica no topo em todas as eras)', () => {
    expect(nameCandidates(['Charizard', 'Fogo', 'Chama Explosiva'])[0]).toBe('Charizard');
  });

  it('descarta números soltos, pontuação e rodapé de copyright', () => {
    const linhas = ['Charizard', '120', '---', '© 1999 Nintendo', 'Illus. Mitsuhiro Arita'];
    expect(nameCandidates(linhas)).toEqual(['Charizard']);
  });

  it('descarta a própria numeração (não é nome de carta)', () => {
    expect(nameCandidates(['025/165'])).toEqual([]);
  });

  it('remove duplicatas e limita o número de consultas ao catálogo', () => {
    const linhas = ['Pikachu', 'Pikachu', 'Raichu', 'Charizard', 'Bulbasaur', 'Squirtle', 'Eevee'];
    const out = nameCandidates(linhas, 3);
    expect(out).toEqual(['Pikachu', 'Raichu', 'Charizard']);
  });

  it('preserva acentos e hífens dos nomes em português', () => {
    expect(nameCandidates(['Nidoran-M', 'Sr. Mime'])).toEqual(['Nidoran-M', 'Sr. Mime']);
  });
});

describe('scoreOf — nome sozinho nunca identifica', () => {
  it('satura em 0.5 sem o número, ficando abaixo do limiar padrão (0.6)', () => {
    // Nome perfeito, número não lido: ainda assim vai para "a revisar" — há dezenas de Pikachus
    // no catálogo e o nome não distingue entre eles.
    expect(scoreOf(1, false)).toBe(0.5);
    expect(scoreOf(1, false)).toBeLessThan(0.6);
  });

  it('com o número casado, um nome bem lido passa do limiar', () => {
    expect(scoreOf(1, true)).toBe(1);
    expect(scoreOf(0.6, true)).toBeGreaterThan(0.6);
  });

  it('com o número casado mas nome ruim, continua em "a revisar"', () => {
    // Foil/reflexo borrando o nome: o número sozinho não basta.
    expect(scoreOf(0.1, true)).toBeLessThan(0.6);
  });
});
