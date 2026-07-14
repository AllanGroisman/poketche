import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Link, Stack, useRouter } from 'expo-router';
import { AsyncBoundary, EmptyState, Screen, useThemeColors } from '@/components';
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
  const c = useThemeColors();
  const state = useAsync(getCollection, []);
  const router = useRouter();

  return (
    <Screen padded={false}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Minha coleção',
          headerRight: () => (
            <Link href="/collection/search" style={{ color: c.primary, fontWeight: '700' }}>
              + Adicionar
            </Link>
          ),
        }}
      />
      <AsyncBoundary state={state} loadingLabel="Carregando coleção…">
        {({ items, summary }) =>
          items.length === 0 ? (
            <EmptyState
              title="Coleção vazia"
              hint="Toque em + Adicionar para buscar e registrar suas cartas."
            />
          ) : (
            <FlatList
              data={items}
              keyExtractor={(i) => i.id}
              contentContainerStyle={styles.list}
              ListHeaderComponent={<CollectionTotal summary={summary} />}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() =>
                    router.push({ pathname: '/collection/details', params: { itemId: item.id } })
                  }
                  style={[styles.row, { borderColor: c.border }]}
                >
                  <Image
                    source={{ uri: imageUrl(item.card.image_small_url) }}
                    style={styles.thumb}
                  />
                  <View style={styles.info}>
                    <Text style={[styles.name, { color: c.text }]}>{item.card.name}</Text>
                    <Text style={[styles.meta, { color: c.muted }]}>
                      {item.card.set.name} · Nº {item.card.number}
                    </Text>
                    <Text style={[styles.meta, { color: c.muted }]}>{subtitle(item)}</Text>
                  </View>
                  <View style={styles.right}>
                    <View style={styles.qtyRow}>
                      <TrendBadge trend={item.trend} />
                      <Text style={[styles.qty, { color: c.text }]}>×{item.quantity}</Text>
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
  const c = useThemeColors();
  return (
    <View style={[styles.totalBox, { borderColor: c.border, backgroundColor: c.card }]}>
      <Text style={[styles.totalLabel, { color: c.muted }]}>Valor estimado</Text>
      <Text style={[styles.totalValue, { color: c.text }]}>{formatBRL(summary.total_cents)}</Text>
      <Text style={[styles.totalMeta, { color: c.muted }]}>
        {summary.priced_items} com cotação
        {summary.unpriced_items > 0 ? ` · ${summary.unpriced_items} sem preço` : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { padding: 12, gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  thumb: { width: 44, height: 61, borderRadius: 4, backgroundColor: '#0002' },
  info: { flex: 1, gap: 2 },
  name: { fontSize: 16, fontWeight: '600' },
  meta: { fontSize: 12 },
  right: { alignItems: 'flex-end', gap: 2, minWidth: 96 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  qty: { fontSize: 16, fontWeight: '700' },
  totalBox: { padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 4, gap: 2 },
  totalLabel: { fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  totalValue: { fontSize: 24, fontWeight: '800' },
  totalMeta: { fontSize: 12 },
});
