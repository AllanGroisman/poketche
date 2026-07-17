import { useState } from 'react';
import { Alert, FlatList, Pressable, Switch, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { AsyncBoundary, EmptyState, Screen, Text, Input, Button } from '@/components';
import { useAsync } from '@/lib/useAsync';
import { WishlistItemRow } from '@/features/wishlist/WishlistItemRow';
import {
  getWishlist,
  removeWishlistItem,
  updateWishlist,
  updateWishlistItem,
  type WishlistItem,
} from '@/features/wishlist/api';

/**
 * Tela de uma wishlist (T065, FR-045/048/049/050/051): cartas com preço atual, alvo, diferença,
 * "atingiu o alvo", "já na coleção" e anúncios no alvo; toggle de notificações da lista.
 *
 * O toggle de notificações **não** muda o que a tela mostra (FR-048): os indicadores continuam
 * iguais — ele só silencia o push.
 */
export default function WishlistDetailScreen() {
  const { wishlistId } = useLocalSearchParams<{ wishlistId: string }>();
  const router = useRouter();
  const state = useAsync(() => getWishlist(wishlistId), [wishlistId]);
  const [editing, setEditing] = useState<WishlistItem | null>(null);

  async function toggleNotifications(enabled: boolean) {
    try {
      await updateWishlist(wishlistId, { notifications_enabled: enabled });
      state.reload();
    } catch {
      Alert.alert('Não foi possível alterar as notificações.');
    }
  }

  function onRemove(item: WishlistItem) {
    Alert.alert('Remover da wishlist', `Remover ${item.card.name}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: async () => {
          try {
            await removeWishlistItem(wishlistId, item.id);
            state.reload();
          } catch {
            Alert.alert('Não foi possível remover.');
          }
        },
      },
    ]);
  }

  return (
    <Screen padded={false}>
      <Stack.Screen options={{ headerShown: true, title: state.data?.name ?? 'Wishlist' }} />
      <AsyncBoundary state={state} loadingLabel="Carregando wishlist…">
        {(list) => (
          <>
            <View className="flex-row items-center gap-3 border-b border-ink-200 p-4 dark:border-ink-800">
              <View className="flex-1">
                <Text weight="bold">Notificar quedas</Text>
                <Text tone="muted" className="mt-0.5 text-xs">
                  {list.summary.item_count} {list.summary.item_count === 1 ? 'carta' : 'cartas'}
                  {list.summary.targets_reached > 0
                    ? ` · ${list.summary.targets_reached} no alvo`
                    : ''}
                  {list.summary.unpriced_items > 0
                    ? ` · ${list.summary.unpriced_items} sem preço`
                    : ''}
                </Text>
              </View>
              <Switch
                value={list.notifications_enabled}
                onValueChange={toggleNotifications}
                trackColor={{ true: '#6366f1', false: '#c9c9d0' }}
              />
            </View>

            {list.items.length === 0 ? (
              <EmptyState
                title="Wishlist vazia"
                hint="Busque cartas no explorador de catálogo e adicione-as aqui com um preço-alvo."
              />
            ) : (
              <FlatList
                data={list.items}
                keyExtractor={(i) => i.id}
                contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 24 }}
                onRefresh={state.reload}
                refreshing={state.loading}
                renderItem={({ item }) => (
                  <Pressable onLongPress={() => onRemove(item)}>
                    <WishlistItemRow
                      item={item}
                      onPress={() =>
                        router.push({
                          pathname: '/explore/card',
                          params: { cardId: item.card.id },
                        })
                      }
                      onEditTarget={() => setEditing(item)}
                    />
                  </Pressable>
                )}
              />
            )}

            {editing ? (
              <TargetEditor
                item={editing}
                onClose={() => setEditing(null)}
                onSaved={() => {
                  setEditing(null);
                  state.reload();
                }}
                wishlistId={wishlistId}
              />
            ) : null}
          </>
        )}
      </AsyncBoundary>
    </Screen>
  );
}

/**
 * Edição do preço-alvo (FR-045). Aceita reais com vírgula e converte para centavos inteiros —
 * nenhuma aritmética de dinheiro em float sai daqui (constituição IV).
 */
function TargetEditor({
  item,
  wishlistId,
  onClose,
  onSaved,
}: {
  item: WishlistItem;
  wishlistId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [text, setText] = useState(
    item.target_price_cents != null
      ? (item.target_price_cents / 100).toFixed(2).replace('.', ',')
      : '',
  );
  const [saving, setSaving] = useState(false);

  async function save(clear = false) {
    setSaving(true);
    try {
      let cents: number | null = null;
      if (!clear) {
        const parsed = Number(text.replace(/\./g, '').replace(',', '.'));
        if (!Number.isFinite(parsed) || parsed <= 0) {
          Alert.alert('Preço-alvo inválido', 'Informe um valor maior que zero.');
          return;
        }
        cents = Math.round(parsed * 100);
      }
      await updateWishlistItem(wishlistId, item.id, cents);
      onSaved();
    } catch {
      Alert.alert('Não foi possível salvar o preço-alvo.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <View className="absolute bottom-3 left-3 right-3 gap-2 rounded-lg border border-ink-200 bg-white p-4 dark:border-ink-800 dark:bg-ink-900">
      <Text weight="bold" className="text-lg">
        Preço-alvo · {item.card.name}
      </Text>
      <Text tone="muted" className="text-xs">
        Avisamos quando o preço de mercado ficar igual ou abaixo do alvo.
      </Text>
      <Input
        value={text}
        onChangeText={setText}
        keyboardType="decimal-pad"
        placeholder="0,00"
        autoFocus
        className="text-lg"
      />
      <View className="mt-1 flex-row justify-end gap-2">
        <Button title="Cancelar" variant="ghost" onPress={onClose} />
        {item.target_price_cents != null ? (
          <Button
            title="Remover alvo"
            variant="ghost"
            disabled={saving}
            onPress={() => save(true)}
          />
        ) : null}
        <Button title="Salvar" loading={saving} disabled={saving} onPress={() => save(false)} />
      </View>
    </View>
  );
}
