import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { AsyncBoundary, Screen, useThemeColors } from '@/components';
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
          <ScrollView contentContainerStyle={styles.container}>
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
  const c = useThemeColors();
  return (
    <View style={{ gap: 10 }}>
      <Text style={[styles.section, { color: c.muted }]}>{title}</Text>
      {children}
    </View>
  );
}

function OverviewCard({ overview }: { overview: StatsOverview }) {
  const c = useThemeColors();
  const change = overview.change_since_last_cents;
  return (
    <View style={[styles.hero, { borderColor: c.border, backgroundColor: c.card }]}>
      <Text style={[styles.heroLabel, { color: c.muted }]}>Valor total estimado</Text>
      <Text style={[styles.heroValue, { color: c.text }]}>{formatBRL(overview.total_cents)}</Text>
      {change != null && change !== 0 ? (
        <Text style={[styles.heroDelta, { color: change > 0 ? c.success : c.danger }]}>
          {formatBRLDelta(change)} desde o último registro
        </Text>
      ) : null}
      <Text style={[styles.heroMeta, { color: c.muted }]}>
        {overview.distinct_cards} cartas · {overview.total_quantity} unidades ·{' '}
        {overview.priced_items} com cotação
        {overview.unpriced_items > 0 ? ` · ${overview.unpriced_items} sem preço` : ''}
      </Text>
    </View>
  );
}

function HistorySection({ history }: { history: StatsHistory }) {
  const c = useThemeColors();
  return (
    <Section title="Evolução do valor">
      {history.history_available ? (
        <Sparkline
          points={history.points.map((p) => ({ t: p.taken_at, price_cents: p.total_cents }))}
        />
      ) : (
        <View style={[styles.unavailable, { borderColor: c.border }]}>
          <Text style={{ color: c.muted, textAlign: 'center' }}>
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
  const c = useThemeColors();
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
      <BarList rows={rows} accent={c.success} />
    </Section>
  );
}

const styles = StyleSheet.create({
  container: { padding: 12, gap: 22, paddingBottom: 40 },
  section: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  hero: { padding: 16, borderRadius: 14, borderWidth: 1, gap: 3 },
  heroLabel: { fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  heroValue: { fontSize: 30, fontWeight: '800' },
  heroDelta: { fontSize: 13, fontWeight: '600' },
  heroMeta: { fontSize: 12, marginTop: 2 },
  unavailable: { padding: 20, borderWidth: 1, borderRadius: 10, borderStyle: 'dashed' },
});
