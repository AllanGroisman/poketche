import { useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { AsyncBoundary, EmptyState, Screen, useThemeColors } from '@/components';
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
  const c = useThemeColors();
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
            <View style={[styles.header, { borderColor: c.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.headerTitle, { color: c.text }]}>Notificar quedas</Text>
                <Text style={[styles.headerMeta, { color: c.muted }]}>
                  {list.summary.item_count} {list.summary.item_count === 1 ? 'carta' : 'cartas'}
                  {list.summary.targets_reached > 0
                    ? ` · ${list.summary.targets_reached} no alvo`
                    : ''}
                  {list.summary.unpriced_items > 0
                    ? ` · ${list.summary.unpriced_items} sem preço`
                    : ''}
                </Text>
              </View>
              <Switch value={list.notifications_enabled} onValueChange={toggleNotifications} />
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
                contentContainerStyle={styles.list}
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
  const c = useThemeColors();
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
    <View style={[styles.sheet, { backgroundColor: c.card, borderColor: c.border }]}>
      <Text style={[styles.sheetTitle, { color: c.text }]}>Preço-alvo · {item.card.name}</Text>
      <Text style={[styles.headerMeta, { color: c.muted }]}>
        Avisamos quando o preço de mercado ficar igual ou abaixo do alvo.
      </Text>
      <TextInput
        value={text}
        onChangeText={setText}
        keyboardType="decimal-pad"
        placeholder="0,00"
        placeholderTextColor={c.muted}
        autoFocus
        style={[styles.input, { color: c.text, borderColor: c.border }]}
      />
      <View style={styles.sheetActions}>
        <Pressable onPress={onClose} style={styles.sheetBtn}>
          <Text style={{ color: c.muted, fontWeight: '600' }}>Cancelar</Text>
        </Pressable>
        {item.target_price_cents != null ? (
          <Pressable onPress={() => save(true)} style={styles.sheetBtn} disabled={saving}>
            <Text style={{ color: c.danger, fontWeight: '600' }}>Remover alvo</Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={() => save(false)}
          disabled={saving}
          style={[styles.sheetBtn, { backgroundColor: c.primary, borderRadius: 8 }]}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>{saving ? '…' : 'Salvar'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 15, fontWeight: '700' },
  headerMeta: { fontSize: 12, marginTop: 2 },
  list: { padding: 12, gap: 10 },
  sheet: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    gap: 8,
  },
  sheetTitle: { fontSize: 16, fontWeight: '700' },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 18,
  },
  sheetActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 4 },
  sheetBtn: { paddingHorizontal: 14, paddingVertical: 10 },
});
