import { FlatList, Image, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { AsyncBoundary, EmptyState, Screen, Text } from '@/components';
import { useAsync } from '@/lib/useAsync';
import { formatDate } from '@/lib/format';
import { getSets, type CatalogSet } from '@/features/catalog/api';

/**
 * Lista de edições — porta de entrada do explorador (T057, FR-068). Pública: abre sem conta.
 * Primeiro dos ≤3 toques até o detalhe da carta (SC-020): edições → grade → detalhe.
 */
export default function ExploreScreen() {
  const router = useRouter();
  const state = useAsync(getSets, []);

  return (
    <Screen padded={false}>
      <Stack.Screen options={{ headerShown: false }} />
      <View className="px-4 pb-2 pt-1">
        <Text weight="extrabold" className="text-2xl">
          Explorar
        </Text>
        <Text tone="muted" className="text-sm">
          Todo o catálogo, edição por edição
        </Text>
      </View>
      <AsyncBoundary state={state} loadingLabel="Carregando edições…">
        {(data) => (
          <FlatList
            data={data.sets}
            keyExtractor={(s) => s.id}
            contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 24 }}
            ListEmptyComponent={
              <EmptyState title="Catálogo vazio" hint="Nenhuma edição sincronizada ainda." />
            }
            renderItem={({ item }) => (
              <SetRow
                set={item}
                onPress={() =>
                  router.push({ pathname: '/explore/set', params: { setId: item.external_id } })
                }
              />
            )}
          />
        )}
      </AsyncBoundary>
    </Screen>
  );
}

function SetRow({ set, onPress }: { set: CatalogSet; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-3 rounded-md border border-ink-200 bg-white p-3 active:opacity-80 dark:border-ink-800 dark:bg-ink-900"
    >
      {set.logo_url ? (
        <Image source={{ uri: set.logo_url }} className="h-10 w-14 rounded" resizeMode="contain" />
      ) : (
        <View className="h-10 w-14 items-center justify-center rounded bg-ink-100 dark:bg-ink-800">
          <Ionicons name="albums-outline" size={18} color="#9a9aa2" />
        </View>
      )}
      <View className="min-w-0 flex-1">
        <Text weight="semibold" numberOfLines={1}>
          {set.name}
        </Text>
        <Text tone="muted" numberOfLines={1} className="text-xs">
          {set.series} · {set.total_cards} cartas
          {set.release_date ? ` · ${formatDate(set.release_date)}` : ''}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color="#9a9aa2" />
    </Pressable>
  );
}
