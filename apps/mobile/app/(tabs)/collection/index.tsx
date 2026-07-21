import { useState } from 'react';
import { Alert, FlatList, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { AsyncBoundary, Button, EmptyState, Input, Screen, Text } from '@/components';
import { useAsync } from '@/lib/useAsync';
import { formatBRL } from '@/lib/format';
import {
  createCollection,
  deleteCollection,
  getCollections,
  renameCollection,
  type CollectionListEntry,
} from '@/features/collections/api';

/**
 * Hub de coleções (US1/US4): cria/renomeia/exclui pastas e lista cada recorte com contagem e
 * valor, mais o acesso ao inventário completo. As pastas são recortes — excluir uma não remove
 * cartas do inventário. Abrir uma pasta leva ao recorte (US3).
 */
export default function CollectionsHubScreen() {
  const state = useAsync(getCollections, []);
  const router = useRouter();
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<CollectionListEntry | null>(null);
  const [saving, setSaving] = useState(false);

  function resetForm() {
    setName('');
    setEditing(null);
  }

  async function onSubmit() {
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      if (editing) {
        await renameCollection(editing.id, trimmed);
        resetForm();
        state.reload();
      } else {
        const created = await createCollection(trimmed);
        resetForm();
        state.reload();
        router.push({ pathname: '/collection/folder', params: { collectionId: created.id } });
      }
    } catch (err) {
      Alert.alert('Não foi possível salvar', err instanceof Error ? err.message : 'Tente de novo.');
    } finally {
      setSaving(false);
    }
  }

  function onLongPress(collection: CollectionListEntry) {
    Alert.alert(collection.name, undefined, [
      {
        text: 'Renomear',
        onPress: () => {
          setEditing(collection);
          setName(collection.name);
        },
      },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: () =>
          Alert.alert(
            'Excluir coleção',
            `Excluir "${collection.name}"? As cartas continuam no seu inventário.`,
            [
              { text: 'Cancelar', style: 'cancel' },
              {
                text: 'Excluir',
                style: 'destructive',
                onPress: async () => {
                  try {
                    await deleteCollection(collection.id);
                    if (editing?.id === collection.id) resetForm();
                    state.reload();
                  } catch {
                    Alert.alert('Não foi possível excluir. Tente de novo.');
                  }
                },
              },
            ],
          ),
      },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  }

  return (
    <Screen padded={false}>
      <Stack.Screen options={{ headerShown: false }} />
      <View className="px-4 pb-2 pt-1">
        <Text weight="extrabold" className="text-2xl">
          Coleções
        </Text>
      </View>

      <View className="flex-row items-end gap-2 border-b border-ink-200 px-4 pb-3 dark:border-ink-800">
        <View className="flex-1">
          <Input
            value={name}
            onChangeText={setName}
            placeholder={editing ? 'Renomear coleção' : 'Nova coleção (ex.: Só Charizards)'}
            onSubmitEditing={onSubmit}
            returnKeyType="done"
            maxLength={60}
          />
        </View>
        <Button
          title={editing ? 'Salvar' : 'Criar'}
          onPress={onSubmit}
          disabled={!name.trim() || saving}
          loading={saving}
        />
        {editing ? (
          <Button title="Cancelar" variant="ghost" onPress={resetForm} disabled={saving} />
        ) : null}
      </View>

      <AsyncBoundary state={state} loadingLabel="Carregando coleções…">
        {({ collections }) => (
          <FlatList
            data={collections}
            keyExtractor={(c) => c.id}
            contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 24 }}
            ListHeaderComponent={
              <Pressable
                onPress={() => router.push('/collection/inventory')}
                className="mb-1 flex-row items-center gap-3 rounded-lg bg-brand-600 p-4 active:bg-brand-700"
              >
                <Ionicons name="albums" size={22} color="#fff" />
                <View className="min-w-0 flex-1">
                  <Text tone="inverse" weight="bold">
                    Inventário completo
                  </Text>
                  <Text tone="inverse" className="text-xs opacity-80">
                    Todas as suas cartas e as estatísticas gerais
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#fff" />
              </Pressable>
            }
            ListEmptyComponent={
              <EmptyState
                title="Nenhuma coleção ainda"
                hint="Crie pastas (ex.: Só Charizards, Favoritas) para organizar recortes do seu inventário."
              />
            }
            renderItem={({ item }) => (
              <Pressable
                onPress={() =>
                  router.push({ pathname: '/collection/folder', params: { collectionId: item.id } })
                }
                onLongPress={() => onLongPress(item)}
                className="flex-row items-center gap-2.5 rounded-md border border-ink-200 bg-white p-3.5 active:opacity-80 dark:border-ink-800 dark:bg-ink-900"
              >
                <View className="min-w-0 flex-1">
                  <View className="flex-row items-center gap-2">
                    <Text weight="bold" numberOfLines={1}>
                      {item.name}
                    </Text>
                    {item.shared ? <Ionicons name="link" size={13} color="#9a9aa2" /> : null}
                  </View>
                  <Text tone="muted" className="mt-0.5 text-xs">
                    {summaryLine(item)}
                  </Text>
                </View>
                <Text weight="semibold" className="text-sm">
                  {formatBRL(item.summary.total_cents)}
                </Text>
                <Ionicons name="chevron-forward" size={18} color="#9a9aa2" />
              </Pressable>
            )}
          />
        )}
      </AsyncBoundary>
    </Screen>
  );
}

function summaryLine(item: CollectionListEntry): string {
  const { distinct_cards, total_quantity, unpriced_items } = item.summary;
  const cards = `${distinct_cards} ${distinct_cards === 1 ? 'carta' : 'cartas'}`;
  const units = `${total_quantity} ${total_quantity === 1 ? 'unidade' : 'unidades'}`;
  const tail = unpriced_items > 0 ? ` · ${unpriced_items} sem preço` : '';
  return `${cards} · ${units}${tail}`;
}
