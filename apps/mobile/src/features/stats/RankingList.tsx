import { Image, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { EmptyState, Text } from '@/components';
import { imageUrl } from '@/services/api';
import { formatBRL, formatBRLDelta, formatPercentDelta } from '@/lib/format';
import type { RankingEntry, RankingType } from './api';

/** Lista de cartas ranqueadas do dashboard (FR-019/FR-020a). Toque abre os detalhes do item. */
export function RankingList({ type, entries }: { type: RankingType; entries: RankingEntry[] }) {
  const router = useRouter();

  if (entries.length === 0) {
    return <EmptyState title="Sem dados" hint={emptyHint(type)} />;
  }

  return (
    <View className="gap-2">
      {entries.map((entry, i) => (
        <Pressable
          key={entry.item_id}
          onPress={() =>
            router.push({ pathname: '/collection/details', params: { itemId: entry.item_id } })
          }
          className="flex-row items-center gap-2.5 rounded-md border border-ink-200 bg-white p-2 active:opacity-80 dark:border-ink-800 dark:bg-ink-900"
        >
          <Text weight="bold" tone="muted" className="w-[18px] text-center text-sm">
            {i + 1}
          </Text>
          <Image
            source={{ uri: imageUrl(entry.card.image_small_url) }}
            className="h-[50px] w-9 rounded bg-ink-100 dark:bg-ink-800"
          />
          <View className="min-w-0 flex-1 gap-0.5">
            <Text weight="semibold" numberOfLines={1}>
              {entry.card.name}
            </Text>
            <Text tone="muted" numberOfLines={1} className="text-xs">
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
  if (type === 'top_value') {
    return (
      <Text weight="bold">{entry.value_cents == null ? '—' : formatBRL(entry.value_cents)}</Text>
    );
  }
  const delta = type === 'acquisition_pnl' ? entry.gain_loss : entry.variation;
  if (!delta) {
    return (
      <Text weight="bold" tone="muted">
        —
      </Text>
    );
  }
  const tone = delta.change_cents > 0 ? 'success' : delta.change_cents < 0 ? 'danger' : 'muted';
  return (
    <View className="items-end">
      <Text weight="bold" tone={tone}>
        {formatPercentDelta(delta.change_pct / 100)}
      </Text>
      <Text tone="muted" className="text-2xs">
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
