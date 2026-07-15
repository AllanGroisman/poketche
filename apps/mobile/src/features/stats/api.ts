import { apiRequest } from '../../services/api';
import type { GainLoss, PeriodVariation } from '../collection/api';

/** Tipos e chamadas do dashboard de estatísticas da coleção (US4, FR-016–FR-020a). */

export interface StatsOverview {
  total_cents: number;
  priced_items: number;
  unpriced_items: number;
  distinct_cards: number;
  total_quantity: number;
  last_snapshot: { total_cents: number; taken_at: string } | null;
  change_since_last_cents: number | null;
}

export interface ValuePoint {
  taken_at: string;
  total_cents: number;
  priced_items: number;
  unpriced_items: number;
}

export type HistoryPeriod = '30d' | '90d' | '180d' | 'all';

export interface StatsHistory {
  period: HistoryPeriod;
  history_available: boolean;
  points: ValuePoint[];
  current: { total_cents: number; priced_items: number };
}

export type DistributionAxis = 'set' | 'rarity' | 'type';

export interface DistributionBucket {
  key: string;
  label: string;
  value_cents: number;
  quantity: number;
  items: number;
}

export interface StatsDistribution {
  by: DistributionAxis;
  buckets: DistributionBucket[];
}

export type RankingType = 'top_value' | 'gainers' | 'losers' | 'acquisition_pnl';
export type RankingPeriod = '7d' | '30d' | '90d';

export interface RankingEntry {
  item_id: string;
  condition: string;
  language: string;
  variant: string;
  quantity: number;
  value_cents: number | null;
  variation: PeriodVariation | null;
  gain_loss: GainLoss | null;
  card: {
    id: string;
    number: string;
    rarity: string;
    name: string;
    image_small_url: string;
    set: { external_id: string; name: string };
  };
}

export interface StatsRankings {
  type: RankingType;
  period: RankingPeriod;
  entries: RankingEntry[];
}

export interface CompletionEntry {
  set_external_id: string;
  set_name: string;
  owned: number;
  total: number;
  pct: number;
}

export interface StatsCompletion {
  sets: CompletionEntry[];
}

export const getOverview = () => apiRequest<StatsOverview>('/stats/overview');

export const getHistory = (period: HistoryPeriod = '90d') =>
  apiRequest<StatsHistory>('/stats/history', { query: { period } });

export const getDistribution = (by: DistributionAxis = 'set') =>
  apiRequest<StatsDistribution>('/stats/distribution', { query: { by } });

export const getRankings = (type: RankingType, period: RankingPeriod = '30d', limit = 10) =>
  apiRequest<StatsRankings>('/stats/rankings', { query: { type, period, limit } });

export const getCompletion = () => apiRequest<StatsCompletion>('/stats/completion');

export const DISTRIBUTION_LABELS: Record<DistributionAxis, string> = {
  set: 'Edição',
  rarity: 'Raridade',
  type: 'Tipo',
};

export const RANKING_LABELS: Record<RankingType, string> = {
  top_value: 'Mais valiosas',
  gainers: 'Valorizações',
  losers: 'Desvalorizações',
  acquisition_pnl: 'Ganho vs. compra',
};
