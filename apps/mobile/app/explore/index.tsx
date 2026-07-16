import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { AsyncBoundary, EmptyState, Screen, useThemeColors } from '@/components';
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
      <Stack.Screen options={{ headerShown: true, title: 'Explorar catálogo' }} />
      <AsyncBoundary state={state} loadingLabel="Carregando edições…">
        {(data) => (
          <FlatList
            data={data.sets}
            keyExtractor={(s) => s.id}
            contentContainerStyle={styles.list}
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
  const c = useThemeColors();
  return (
    <Pressable onPress={onPress} style={[styles.row, { borderColor: c.border }]}>
      {set.logo_url ? (
        <Image source={{ uri: set.logo_url }} style={styles.logo} resizeMode="contain" />
      ) : (
        <View style={[styles.logo, { backgroundColor: c.card }]} />
      )}
      <View style={{ flex: 1 }}>
        <Text style={[styles.name, { color: c.text }]}>{set.name}</Text>
        <Text style={[styles.meta, { color: c.muted }]}>
          {set.series} · {set.total_cards} cartas
          {set.release_date ? ` · ${formatDate(set.release_date)}` : ''}
        </Text>
      </View>
    </Pressable>
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
  logo: { width: 56, height: 40, borderRadius: 4 },
  name: { fontSize: 16, fontWeight: '600' },
  meta: { fontSize: 12 },
});
