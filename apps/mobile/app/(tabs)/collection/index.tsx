import { FlatList, Image, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { AsyncBoundary, EmptyState, Screen, Text } from '@/components';
import { useAsync } from '@/lib/useAsync';
import { imageUrl } from '@/services/api';
import { formatBRL } from '@/lib/format';
import { PriceTag } from '@/features/pricing/PriceTag';
import { TrendBadge } from '@/features/pricing/history/TrendBadge';
import {
  CONDITION_LABELS,
  VARIANT_LABELS,
  getCollection,
  type CollectionItem,
  type CollectionSummary,
} from '@/features/collection/api';

export default function CollectionScreen() {
  const state = useAsync(getCollection, []);
  const router = useRouter();

  return (
    <Screen padded={false}>
      <Stack.Screen options={{ headerShown: false }} />
      <View className="flex-row items-center justify-between px-4 pb-2 pt-1">
        <Text weight="extrabold" className="text-2xl">
          Minha coleção
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/collection/search')}
          className="flex-row items-center gap-1 rounded-full bg-brand-600 px-3 py-2 active:bg-brand-700"
        >
          <Ionicons name="add" size={18} color="#fff" />
          <Text weight="semibold" tone="inverse" className="text-sm">
            Adicionar
          </Text>
        </Pressable>
      </View>

      <AsyncBoundary state={state} loadingLabel="Carregando coleção…">
        {({ items, summary }) =>
          items.length === 0 ? (
            <EmptyState
              title="Coleção vazia"
              hint="Toque em Adicionar para buscar e registrar suas cartas."
            />
          ) : (
            <FlatList
              data={items}
              keyExtractor={(i) => i.id}
              contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 24 }}
              ListHeaderComponent={<CollectionTotal summary={summary} />}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() =>
                    router.push({ pathname: '/collection/details', params: { itemId: item.id } })
                  }
                  className="flex-row items-center gap-3 rounded-md border border-ink-200 bg-white p-2.5 active:opacity-80 dark:border-ink-800 dark:bg-ink-900"
                >
                  <Image
                    source={{ uri: imageUrl(item.card.image_small_url) }}
                    className="h-[61px] w-11 rounded bg-ink-100 dark:bg-ink-800"
                  />
                  <View className="min-w-0 flex-1 gap-0.5">
                    <Text weight="semibold" numberOfLines={1}>
                      {item.card.name}
                    </Text>
                    <Text tone="muted" numberOfLines={1} className="text-xs">
                      {item.card.set.name} · Nº {item.card.number}
                    </Text>
                    <Text tone="muted" numberOfLines={1} className="text-xs">
                      {subtitle(item)}
                    </Text>
                  </View>
                  <View className="min-w-[96px] items-end gap-1">
                    <View className="flex-row items-center gap-1">
                      <TrendBadge trend={item.trend} />
                      <Text weight="bold">×{item.quantity}</Text>
                    </View>
                    <PriceTag price={item.price} />
                  </View>
                </Pressable>
              )}
            />
          )
        }
      </AsyncBoundary>
    </Screen>
  );
}

function subtitle(item: CollectionItem): string {
  const parts = [CONDITION_LABELS[item.condition], item.language.toUpperCase()];
  if (item.variant !== 'normal') parts.push(VARIANT_LABELS[item.variant]);
  return parts.join(' · ');
}

/** Cabeçalho com o valor total da coleção; itens sem cotação são indicados à parte (FR-016). */
function CollectionTotal({ summary }: { summary: CollectionSummary }) {
  return (
    <View className="mb-1 gap-1 rounded-lg bg-brand-600 p-4">
      <Text tone="inverse" weight="medium" className="text-xs uppercase opacity-80">
        Valor estimado
      </Text>
      <Text tone="inverse" weight="extrabold" className="text-3xl">
        {formatBRL(summary.total_cents)}
      </Text>
      <Text tone="inverse" className="text-xs opacity-80">
        {summary.priced_items} com cotação
        {summary.unpriced_items > 0 ? ` · ${summary.unpriced_items} sem preço` : ''}
      </Text>
    </View>
  );
}
