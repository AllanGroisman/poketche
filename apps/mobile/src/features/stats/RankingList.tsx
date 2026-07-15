import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { EmptyState, useThemeColors } from '@/components';
import { imageUrl } from '@/services/api';
import { formatBRL, formatBRLDelta, formatPercentDelta } from '@/lib/format';
import type { RankingEntry, RankingType } from './api';

/** Lista de cartas ranqueadas do dashboard (FR-019/FR-020a). Toque abre os detalhes do item. */
export function RankingList({ type, entries }: { type: RankingType; entries: RankingEntry[] }) {
  const c = useThemeColors();
  const router = useRouter();

  if (entries.length === 0) {
    return <EmptyState title="Sem dados" hint={emptyHint(type)} />;
  }

  return (
    <View style={{ gap: 8 }}>
      {entries.map((entry, i) => (
        <Pressable
          key={entry.item_id}
          onPress={() =>
            router.push({ pathname: '/collection/details', params: { itemId: entry.item_id } })
          }
          style={[styles.row, { borderColor: c.border }]}
        >
          <Text style={[styles.rank, { color: c.muted }]}>{i + 1}</Text>
          <Image source={{ uri: imageUrl(entry.card.image_small_url) }} style={styles.thumb} />
          <View style={styles.info}>
            <Text style={[styles.name, { color: c.text }]} numberOfLines={1}>
              {entry.card.name}
            </Text>
            <Text style={[styles.meta, { color: c.muted }]} numberOfLines={1}>
              {entry.card.set.name} · Nº {entry.card.number}
              {entry.quantity > 1 ? ` · ×${entry.quantity}` : ''}
            </Text>
          </View>
          <Metric type={type} entry={entry} />
        </Pressable>
      ))}
    </View>
  );
}

function Metric({ type, entry }: { type: RankingType; entry: RankingEntry }) {
  const c = useThemeColors();
  if (type === 'top_value') {
    return (
      <Text style={[styles.metricValue, { color: c.text }]}>
        {entry.value_cents == null ? '—' : formatBRL(entry.value_cents)}
      </Text>
    );
  }
  const delta = type === 'acquisition_pnl' ? entry.gain_loss : entry.variation;
  if (!delta) return <Text style={[styles.metricValue, { color: c.muted }]}>—</Text>;
  const color = delta.change_cents > 0 ? c.success : delta.change_cents < 0 ? c.danger : c.muted;
  return (
    <View style={styles.metric}>
      <Text style={[styles.metricValue, { color }]}>
        {formatPercentDelta(delta.change_pct / 100)}
      </Text>
      <Text style={[styles.metricSub, { color: c.muted }]}>
        {formatBRLDelta(delta.change_cents)}
      </Text>
    </View>
  );
}

function emptyHint(type: RankingType): string {
  if (type === 'acquisition_pnl') return 'Informe o preço de compra dos itens para ver o ganho.';
  if (type === 'gainers' || type === 'losers')
    return 'Ainda não há histórico suficiente para o período.';
  return 'Adicione cartas com cotação à sua coleção.';
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  rank: { width: 18, textAlign: 'center', fontSize: 13, fontWeight: '700' },
  thumb: { width: 36, height: 50, borderRadius: 4, backgroundColor: '#0002' },
  info: { flex: 1, gap: 2 },
  name: { fontSize: 15, fontWeight: '600' },
  meta: { fontSize: 12 },
  metric: { alignItems: 'flex-end' },
  metricValue: { fontSize: 15, fontWeight: '700' },
  metricSub: { fontSize: 11 },
});
