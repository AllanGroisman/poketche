import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Screen, Text, Input } from '@/components';
import { imageUrl, ApiError } from '@/services/api';
import { searchCards, type CardResult } from '@/features/collection/api';

/** Busca com autocomplete (debounce) sobre o catálogo multilíngue (T031, FR-011). */
export default function SearchScreen() {
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
      <View className="p-4 pb-2">
        <Input autoFocus placeholder="Nome da carta (PT ou EN)…" value={q} onChangeText={setQ} />
      </View>
      {loading ? <ActivityIndicator color="#6366f1" className="mt-3" /> : null}
      {error ? (
        <Text tone="danger" className="px-4 text-sm">
          {error}
        </Text>
      ) : null}
      <FlatList
        data={results}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <Pressable
            onPress={() =>
              router.push({
                pathname: '/collection/item',
                params: { cardId: item.id, cardName: item.name, cardImage: item.image_small_url },
              })
            }
            className="flex-row items-center gap-3 rounded-md border border-ink-200 bg-white p-2.5 active:opacity-80 dark:border-ink-800 dark:bg-ink-900"
          >
            <Image
              source={{ uri: imageUrl(item.image_small_url) }}
              className="h-14 w-10 rounded bg-ink-100 dark:bg-ink-800"
            />
            <View className="min-w-0 flex-1">
              <Text weight="semibold" numberOfLines={1}>
                {item.name}
              </Text>
              <Text tone="muted" numberOfLines={1} className="text-xs">
                {item.set.name} · Nº {item.number} · {item.rarity}
              </Text>
            </View>
          </Pressable>
        )}
      />
    </Screen>
  );
}
