import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Stack } from 'expo-router';
import { AsyncBoundary, Screen, Text, Card } from '@/components';
import { useAsync } from '@/lib/useAsync';
import { formatBRL, formatBRLDelta } from '@/lib/format';
import { Sparkline } from '@/features/pricing/history/Sparkline';
import { BarList, type BarRow } from '@/features/stats/BarList';
import { RankingList } from '@/features/stats/RankingList';
import { Segmented } from '@/features/stats/Segmented';
import {
  DISTRIBUTION_LABELS,
  RANKING_LABELS,
  getCompletion,
  getDistribution,
  getHistory,
  getOverview,
  getRankings,
  type DistributionAxis,
  type RankingType,
  type StatsCompletion,
  type StatsHistory,
  type StatsOverview,
} from '@/features/stats/api';

/**
 * Dashboard de estatísticas da coleção (T048, US4/FR-016–FR-020a): valor total e evolução,
 * distribuições, rankings (valor/valorização/P&L) e completude por edição.
 */
export default function DashboardScreen() {
  const state = useAsync(
    () => Promise.all([getOverview(), getHistory('90d'), getCompletion()]),
    [],
  );

  return (
    <Screen padded={false}>
      <Stack.Screen options={{ headerShown: true, title: 'Estatísticas' }} />
      <AsyncBoundary state={state} loadingLabel="Calculando estatísticas…">
        {([overview, history, completion]) => (
          <ScrollView contentContainerStyle={{ padding: 16, gap: 22, paddingBottom: 40 }}>
            <OverviewCard overview={overview} />
            <HistorySection history={history} />
            <DistributionSection />
            <RankingSection />
            <CompletionSection completion={completion} />
          </ScrollView>
        )}
      </AsyncBoundary>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="gap-2.5">
      <Text tone="muted" weight="bold" className="text-xs uppercase tracking-wide">
        {title}
      </Text>
      {children}
    </View>
  );
}

function OverviewCard({ overview }: { overview: StatsOverview }) {
  const change = overview.change_since_last_cents;
  return (
    <View className="gap-1 rounded-lg bg-brand-600 p-4">
      <Text tone="inverse" weight="medium" className="text-xs uppercase opacity-80">
        Valor total estimado
      </Text>
      <Text tone="inverse" weight="extrabold" className="text-4xl">
        {formatBRL(overview.total_cents)}
      </Text>
      {change != null && change !== 0 ? (
        <Text tone="inverse" weight="semibold" className="text-sm opacity-90">
          {formatBRLDelta(change)} desde o último registro
        </Text>
      ) : null}
      <Text tone="inverse" className="mt-0.5 text-xs opacity-80">
        {overview.distinct_cards} cartas · {overview.total_quantity} unidades ·{' '}
        {overview.priced_items} com cotação
        {overview.unpriced_items > 0 ? ` · ${overview.unpriced_items} sem preço` : ''}
      </Text>
    </View>
  );
}

function HistorySection({ history }: { history: StatsHistory }) {
  return (
    <Section title="Evolução do valor">
      {history.history_available ? (
        <Card pad="md">
          <Sparkline
            points={history.points.map((p) => ({ t: p.taken_at, price_cents: p.total_cents }))}
          />
        </Card>
      ) : (
        <View className="rounded-md border border-dashed border-ink-300 p-5 dark:border-ink-700">
          <Text tone="muted" className="text-center text-sm">
            A evolução aparece após alguns dias de registro do valor da coleção.
          </Text>
        </View>
      )}
    </Section>
  );
}

function DistributionSection() {
  const [by, setBy] = useState<DistributionAxis>('set');
  const state = useAsync(() => getDistribution(by), [by]);
  return (
    <Section title="Distribuição">
      <Segmented
        value={by}
        onChange={setBy}
        options={(['set', 'rarity', 'type'] as const).map((v) => ({
          value: v,
          label: DISTRIBUTION_LABELS[v],
        }))}
      />
      <AsyncBoundary state={state} loadingLabel="Carregando…">
        {(data) => {
          const rows: BarRow[] = data.buckets.slice(0, 8).map((b) => ({
            key: b.key,
            label: b.label,
            amount: b.value_cents,
            trailing: formatBRL(b.value_cents),
            hint: `${b.quantity} ${b.quantity === 1 ? 'unidade' : 'unidades'}`,
          }));
          return <BarList rows={rows} />;
        }}
      </AsyncBoundary>
    </Section>
  );
}

function RankingSection() {
  const [type, setType] = useState<RankingType>('top_value');
  const state = useAsync(() => getRankings(type, '30d'), [type]);
  return (
    <Section title="Rankings">
      <Segmented
        value={type}
        onChange={setType}
        options={(['top_value', 'gainers', 'losers', 'acquisition_pnl'] as const).map((v) => ({
          value: v,
          label: RANKING_LABELS[v],
        }))}
      />
      <AsyncBoundary state={state} loadingLabel="Carregando…">
        {(data) => <RankingList type={type} entries={data.entries} />}
      </AsyncBoundary>
    </Section>
  );
}

function CompletionSection({ completion }: { completion: StatsCompletion }) {
  if (completion.sets.length === 0) return null;
  const rows: BarRow[] = completion.sets.slice(0, 12).map((s) => ({
    key: s.set_external_id,
    label: s.set_name,
    amount: s.pct,
    trailing: `${s.pct}%`,
    hint: `${s.owned} de ${s.total}`,
  }));
  return (
    <Section title="Completude por edição">
      <BarList rows={rows} accent="#16a34a" />
    </Section>
  );
}
