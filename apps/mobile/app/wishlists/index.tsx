import { useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, router } from 'expo-router';
import { AsyncBoundary, EmptyState, Screen, useThemeColors } from '@/components';
import { useAsync } from '@/lib/useAsync';
import {
  createWishlist,
  deleteWishlist,
  getWishlists,
  type WishlistSummary,
} from '@/features/wishlist/api';

/**
 * Wishlists do usuário (T065, FR-044): criar, abrir, excluir. O preço-alvo e os indicadores
 * ficam na tela da lista (`[id]`), que é onde as cartas aparecem.
 */
export default function WishlistsScreen() {
  const state = useAsync(getWishlists, []);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const c = useThemeColors();

  async function onCreate() {
    const trimmed = name.trim();
    if (!trimmed || creating) return;
    setCreating(true);
    try {
      const created = await createWishlist(trimmed);
      setName('');
      state.reload();
      router.push({ pathname: '/wishlists/detail', params: { wishlistId: created.id } });
    } catch (err) {
      Alert.alert('Não foi possível criar', err instanceof Error ? err.message : 'Tente de novo.');
    } finally {
      setCreating(false);
    }
  }

  function onDelete(list: WishlistSummary) {
    Alert.alert('Excluir wishlist', `Excluir "${list.name}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteWishlist(list.id);
            state.reload();
          } catch {
            Alert.alert('Não foi possível excluir. Tente de novo.');
          }
        },
      },
    ]);
  }

  return (
    <Screen padded={false}>
      <Stack.Screen options={{ headerShown: true, title: 'Wishlists' }} />

      <View style={[styles.creator, { borderColor: c.border }]}>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Nova wishlist (ex.: Completar Base Set)"
          placeholderTextColor={c.muted}
          style={[styles.input, { color: c.text, borderColor: c.border, backgroundColor: c.card }]}
          onSubmitEditing={onCreate}
          returnKeyType="done"
          maxLength={60}
        />
        <Pressable
          onPress={onCreate}
          disabled={!name.trim() || creating}
          style={[styles.add, { backgroundColor: name.trim() ? c.primary : c.border }]}
        >
          <Text style={styles.addText}>{creating ? '…' : 'Criar'}</Text>
        </Pressable>
      </View>

      <AsyncBoundary state={state} loadingLabel="Carregando wishlists…">
        {(lists) =>
          lists.length === 0 ? (
            <EmptyState
              title="Nenhuma wishlist ainda"
              hint="Crie uma lista e adicione cartas com preço-alvo para ser avisado quando o preço cair."
            />
          ) : (
            <FlatList
              data={lists}
              keyExtractor={(l) => l.id}
              contentContainerStyle={styles.list}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() =>
                    router.push({ pathname: '/wishlists/detail', params: { wishlistId: item.id } })
                  }
                  onLongPress={() => onDelete(item)}
                  style={[styles.card, { borderColor: c.border, backgroundColor: c.card }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.cardName, { color: c.text }]}>{item.name}</Text>
                    <Text style={[styles.cardMeta, { color: c.muted }]}>
                      {item.item_count} {item.item_count === 1 ? 'carta' : 'cartas'}
                      {item.notifications_enabled ? '' : ' · notificações desligadas'}
                    </Text>
                  </View>
                  <Text style={{ color: c.muted, fontSize: 20 }}>›</Text>
                </Pressable>
              )}
            />
          )
        }
      </AsyncBoundary>
    </Screen>
  );
}

const styles = StyleSheet.create({
  creator: { flexDirection: 'row', gap: 8, padding: 12, borderBottomWidth: 1 },
  input: { flex: 1, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  add: { paddingHorizontal: 16, justifyContent: 'center', borderRadius: 10 },
  addText: { color: '#fff', fontWeight: '700' },
  list: { padding: 12, gap: 10 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderWidth: 1,
    borderRadius: 12,
  },
  cardName: { fontSize: 16, fontWeight: '700' },
  cardMeta: { fontSize: 12, marginTop: 2 },
});
