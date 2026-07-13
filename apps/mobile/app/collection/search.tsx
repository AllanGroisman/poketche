import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Screen, useThemeColors } from '@/components';
import { imageUrl, ApiError } from '@/services/api';
import { searchCards, type CardResult } from '@/features/collection/api';

/** Busca com autocomplete (debounce) sobre o catálogo multilíngue (T031, FR-011). */
export default function SearchScreen() {
  const c = useThemeColors();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<CardResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResults([]);
      setError(null);
      return;
    }
    let active = true;
    setLoading(true);
    const timer = setTimeout(() => {
      searchCards(term, 'pt')
        .then((r) => active && setResults(r.results))
        .catch((e) => active && setError(e instanceof ApiError ? e.message : 'Falha na busca.'))
        .finally(() => active && setLoading(false));
    }, 300); // debounce
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [q]);

  return (
    <Screen padded={false}>
      <Stack.Screen options={{ headerShown: true, title: 'Buscar carta' }} />
      <View style={styles.searchBox}>
        <TextInput
          autoFocus
          placeholder="Nome da carta (PT ou EN)…"
          placeholderTextColor={c.muted}
          value={q}
          onChangeText={setQ}
          style={[styles.input, { color: c.text, borderColor: c.border, backgroundColor: c.card }]}
        />
      </View>
      {loading ? <ActivityIndicator color={c.primary} style={{ marginTop: 12 }} /> : null}
      {error ? <Text style={[styles.error, { color: c.danger }]}>{error}</Text> : null}
      <FlatList
        data={results}
        keyExtractor={(r) => r.id}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <Pressable
            onPress={() =>
              router.push({
                pathname: '/collection/item',
                params: { cardId: item.id, cardName: item.name, cardImage: item.image_small_url },
              })
            }
            style={[styles.row, { borderColor: c.border }]}
          >
            <Image source={{ uri: imageUrl(item.image_small_url) }} style={styles.thumb} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.name, { color: c.text }]}>{item.name}</Text>
              <Text style={[styles.meta, { color: c.muted }]}>
                {item.set.name} · Nº {item.number} · {item.rarity}
              </Text>
            </View>
          </Pressable>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  searchBox: { padding: 12 },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 16 },
  error: { paddingHorizontal: 12, fontSize: 14 },
  list: { padding: 12, gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  thumb: { width: 40, height: 56, borderRadius: 4, backgroundColor: '#0002' },
  name: { fontSize: 16, fontWeight: '600' },
  meta: { fontSize: 12 },
});
