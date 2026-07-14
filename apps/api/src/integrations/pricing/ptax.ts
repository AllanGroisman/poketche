import type { HttpJson } from '../catalog/http.js';
import type { FxRateProvider } from './types.js';

/**
 * Câmbio USD→BRL pela **PTAX** (API pública do Banco Central — Olinda/OData). Usa a cotação
 * de **venda** do dólar. Em dias sem pregão (fim de semana/feriado) a API retorna vazio; o
 * cliente faz *walk-back* de até `maxLookbackDays` dias. Resultado cacheado por dia para não
 * refazer a chamada a cada carta do ciclo de preços. Injeta `HttpJson` para teste sem rede.
 */

interface PtaxRow {
  cotacaoCompra?: number;
  cotacaoVenda?: number;
  dataHoraCotacao?: string;
}
interface PtaxResponse {
  value?: PtaxRow[];
}

export class PtaxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PtaxError';
  }
}

/** Formata a data como MM-DD-YYYY (formato exigido pelo endpoint CotacaoDolarDia). */
export function formatPtaxDate(date: Date): string {
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const yyyy = date.getUTCFullYear();
  return `${mm}-${dd}-${yyyy}`;
}

/** Extrai a cotação de venda de uma resposta PTAX; null quando não há pregão na data. */
export function parsePtaxVenda(payload: unknown): number | null {
  const rows = (payload as PtaxResponse)?.value;
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const venda = rows[rows.length - 1]?.cotacaoVenda;
  return typeof venda === 'number' && venda > 0 ? venda : null;
}

export class PtaxClient implements FxRateProvider {
  private readonly baseUrl: string;
  private readonly maxLookbackDays: number;
  private readonly cache = new Map<string, number>();

  constructor(
    private readonly http: HttpJson,
    opts: { baseUrl: string; maxLookbackDays?: number },
  ) {
    this.baseUrl = opts.baseUrl;
    this.maxLookbackDays = opts.maxLookbackDays ?? 7;
  }

  async usdToBrl(date: Date = new Date()): Promise<number> {
    for (let back = 0; back <= this.maxLookbackDays; back++) {
      const day = new Date(date);
      day.setUTCDate(day.getUTCDate() - back);
      const key = formatPtaxDate(day);

      const cached = this.cache.get(key);
      if (cached != null) return cached;

      const url =
        `${this.baseUrl}/CotacaoDolarDia(dataCotacao=@dataCotacao)` +
        `?@dataCotacao='${key}'&$format=json`;
      const venda = parsePtaxVenda(await this.http(url));
      if (venda != null) {
        this.cache.set(key, venda);
        return venda;
      }
    }
    throw new PtaxError(
      `sem cotação PTAX nos últimos ${this.maxLookbackDays} dias a partir de ${formatPtaxDate(date)}`,
    );
  }
}
