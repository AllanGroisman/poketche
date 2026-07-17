import { useState } from 'react';
import { Alert, FlatList, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, router } from 'expo-router';
import { AsyncBoundary, EmptyState, Screen, Text, Input, Button } from '@/components';
import { useAsync } from '@/lib/useAsync';
import {
  createWishlist,
  deleteWishlist,
  getWishlists,
  type WishlistSummary,
} from '@/features/wishlist/api';

/**
 * Wishlists do usuário (T065, FR-044): criar, abrir, excluir. O preço-alvo e os indicadores
 * ficam na tela da lista (`detail`), que é onde as cartas aparecem.
 */
export default function WishlistsScreen() {
  const state = useAsync(getWishlists, []);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);

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
      <Stack.Screen options={{ headerShown: false }} />
      <View className="px-4 pb-2 pt-1">
        <Text weight="extrabold" className="text-2xl">
          Wishlists
        </Text>
      </View>

      <View className="flex-row items-end gap-2 border-b border-ink-200 px-4 pb-3 dark:border-ink-800">
        <View className="flex-1">
          <Input
            value={name}
            onChangeText={setName}
            placeholder="Nova wishlist (ex.: Completar Base Set)"
            onSubmitEditing={onCreate}
            returnKeyType="done"
            maxLength={60}
          />
        </View>
        <Button
          title="Criar"
          onPress={onCreate}
          disabled={!name.trim() || creating}
          loading={creating}
        />
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
              contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 24 }}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() =>
                    router.push({ pathname: '/wishlists/detail', params: { wishlistId: item.id } })
                  }
                  onLongPress={() => onDelete(item)}
                  className="flex-row items-center gap-2.5 rounded-md border border-ink-200 bg-white p-3.5 active:opacity-80 dark:border-ink-800 dark:bg-ink-900"
                >
                  <View className="min-w-0 flex-1">
                    <Text weight="bold" numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text tone="muted" className="mt-0.5 text-xs">
                      {item.item_count} {item.item_count === 1 ? 'carta' : 'cartas'}
                      {item.notifications_enabled ? '' : ' · notificações desligadas'}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#9a9aa2" />
                </Pressable>
              )}
            />
          )
        }
      </AsyncBoundary>
    </Screen>
  );
}
