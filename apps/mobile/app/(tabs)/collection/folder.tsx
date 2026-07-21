import { Alert, FlatList, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { AsyncBoundary, EmptyState, Screen, Text } from '@/components';
import { useAsync } from '@/lib/useAsync';
import { formatBRL } from '@/lib/format';
import { CollectionItemRow } from '@/features/collection/CollectionItemRow';
import {
  getCollectionSlice,
  removeFromCollection,
  type CollectionSlice,
} from '@/features/collections/api';

/**
 * Recorte de uma coleção personalizada (US3): as cartas vinculadas, com a MESMA apresentação da
 * listagem do inventário (reusa `CollectionItemRow`), mais o resumo do recorte (cartas distintas ·
 * unidades · valor). Toque longo remove a carta do recorte (não do inventário).
 */
export default function CollectionFolderScreen() {
  const { collectionId } = useLocalSearchParams<{ collectionId: string }>();
  const state = useAsync(() => getCollectionSlice(collectionId), [collectionId]);
  const router = useRouter();

  function onRemove(itemId: string, name: string) {
    Alert.alert(
      'Remover do recorte',
      `Tirar "${name}" desta coleção? A carta continua no seu inventário.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Remover',
          style: 'destructive',
          onPress: async () => {
            try {
              await removeFromCollection(collectionId, itemId);
              state.reload();
            } catch {
              Alert.alert('Não foi possível remover. Tente de novo.');
            }
          },
        },
      ],
    );
  }

  return (
    <Screen padded={false}>
      <Stack.Screen options={{ headerShown: true, title: 'Coleção' }} />
      <AsyncBoundary state={state} loadingLabel="Carregando coleção…">
        {(slice) => (
          <FlatList
            data={slice.items}
            keyExtractor={(i) => i.id}
            contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 24 }}
            ListHeaderComponent={
              <SliceHeader
                slice={slice}
                onShare={() =>
                  router.push({ pathname: '/collection/folder-share', params: { collectionId } })
                }
              />
            }
            ListEmptyComponent={
              <EmptyState
                title="Recorte vazio"
                hint="Abra uma carta no inventário e toque em “Adicionar a uma coleção”."
              />
            }
            renderItem={({ item }) => (
              <CollectionItemRow
                item={item}
                onPress={() =>
                  router.push({ pathname: '/collection/details', params: { itemId: item.id } })
                }
                onLongPress={() => onRemove(item.id, item.card.name)}
              />
            )}
          />
        )}
      </AsyncBoundary>
    </Screen>
  );
}

function SliceHeader({ slice, onShare }: { slice: CollectionSlice; onShare: () => void }) {
  const { distinct_cards, total_quantity, unpriced_items, total_cents } = slice.summary;
  return (
    <View className="mb-1 gap-2 rounded-lg bg-brand-600 p-4">
      <View className="flex-row items-start justify-between">
        <View className="min-w-0 flex-1 gap-1">
          <Text tone="inverse" weight="extrabold" className="text-xl" numberOfLines={1}>
            {slice.name}
          </Text>
          <Text tone="inverse" className="text-xs opacity-80">
            {distinct_cards} {distinct_cards === 1 ? 'carta' : 'cartas'} · {total_quantity}{' '}
            {total_quantity === 1 ? 'unidade' : 'unidades'}
            {unpriced_items > 0 ? ` · ${unpriced_items} sem preço` : ''}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={onShare}
          className="flex-row items-center gap-1 rounded-full bg-white/20 px-3 py-1.5 active:bg-white/30"
        >
          <Ionicons name={slice.shared ? 'link' : 'share-social-outline'} size={15} color="#fff" />
          <Text tone="inverse" weight="semibold" className="text-xs">
            {slice.shared ? 'Compartilhado' : 'Compartilhar'}
          </Text>
        </Pressable>
      </View>
      <Text tone="inverse" weight="extrabold" className="text-3xl">
        {formatBRL(total_cents)}
      </Text>
    </View>
  );
}
