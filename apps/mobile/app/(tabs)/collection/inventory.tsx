import { FlatList, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { AsyncBoundary, EmptyState, Screen, Text } from '@/components';
import { useAsync } from '@/lib/useAsync';
import { formatBRL } from '@/lib/format';
import { CollectionItemRow } from '@/features/collection/CollectionItemRow';
import { getCollection, type CollectionSummary } from '@/features/collection/api';

/**
 * Listagem do inventário completo (US2) — fonte de verdade e base das estatísticas gerais.
 * Extraída da antiga tela principal da aba (que virou o hub de coleções personalizadas, US4);
 * a lógica de listagem/apresentação permanece inalterada.
 */
export default function InventoryScreen() {
  const state = useAsync(getCollection, []);
  const router = useRouter();

  return (
    <Screen padded={false}>
      <Stack.Screen options={{ headerShown: true, title: 'Minha coleção' }} />
      <View className="flex-row items-center justify-between px-4 pb-2 pt-1">
        <Text weight="extrabold" className="text-2xl">
          Inventário completo
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
                <CollectionItemRow
                  item={item}
                  onPress={() =>
                    router.push({ pathname: '/collection/details', params: { itemId: item.id } })
                  }
                />
              )}
            />
          )
        }
      </AsyncBoundary>
    </Screen>
  );
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
