import { useState } from 'react';
import { Switch, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { AsyncBoundary, Screen, Text, Card, Button } from '@/components';
import { useAsync } from '@/lib/useAsync';
import {
  generateShareLink,
  getCollectionShare,
  revokeShareLink,
  setCollectionVisibility,
  type CollectionShareState,
} from '@/features/collections/api';

/**
 * Compartilhamento de uma coleção personalizada por link público (US5). Espelha a visibilidade
 * do inventário (US7), mas por pasta: as flags controlam o que o link revela e o dono pode
 * gerar/revogar o link a qualquer momento.
 */
export default function CollectionShareScreen() {
  const { collectionId } = useLocalSearchParams<{ collectionId: string }>();
  const state = useAsync(() => getCollectionShare(collectionId), [collectionId]);
  return (
    <Screen>
      <Stack.Screen options={{ headerShown: true, title: 'Compartilhar coleção' }} />
      <AsyncBoundary state={state} loadingLabel="Carregando…">
        {(initial) => <Editor collectionId={collectionId} initial={initial} />}
      </AsyncBoundary>
    </Screen>
  );
}

function Editor({
  collectionId,
  initial,
}: {
  collectionId: string;
  initial: CollectionShareState;
}) {
  const [share, setShare] = useState<CollectionShareState>(initial);
  const [busy, setBusy] = useState(false);

  async function toggle(key: 'show_cards' | 'show_values' | 'show_quantities', value: boolean) {
    const next = { ...share, [key]: value };
    setShare(next); // otimista
    try {
      const updated = await setCollectionVisibility(collectionId, {
        show_cards: next.show_cards,
        show_values: next.show_values,
        show_quantities: next.show_quantities,
      });
      setShare(updated);
    } catch {
      setShare((v) => ({ ...v, [key]: !value })); // reverte
    }
  }

  async function run(action: 'generate' | 'revoke') {
    setBusy(true);
    try {
      setShare(
        action === 'generate'
          ? await generateShareLink(collectionId)
          : await revokeShareLink(collectionId),
      );
    } finally {
      setBusy(false);
    }
  }

  const isPublic = share.status === 'public_link' && share.share_url;

  return (
    <View className="flex-1 gap-1 pt-2">
      <Row
        label="Mostrar cartas"
        value={share.show_cards}
        onChange={(v) => toggle('show_cards', v)}
      />
      <Row
        label="Mostrar valores"
        value={share.show_values}
        onChange={(v) => toggle('show_values', v)}
      />
      <Row
        label="Mostrar quantidades"
        value={share.show_quantities}
        onChange={(v) => toggle('show_quantities', v)}
      />

      <Card pad="lg" className="mt-6 gap-3">
        <Text weight="bold" className="text-lg">
          Link público
        </Text>
        {isPublic ? (
          <>
            <Text selectable tone="muted" className="text-sm">
              {share.share_url}
            </Text>
            <Button
              title="Revogar link"
              variant="outline"
              fullWidth
              disabled={busy}
              onPress={() => run('revoke')}
            />
          </>
        ) : (
          <>
            <Text tone="muted" className="text-sm">
              Esta coleção está privada. Gere um link para mostrar este recorte a alguém.
            </Text>
            <Button
              title="Gerar link público"
              fullWidth
              disabled={busy}
              onPress={() => run('generate')}
            />
          </>
        )}
      </Card>
    </View>
  );
}

function Row({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View className="flex-row items-center justify-between border-b border-ink-200 py-3.5 dark:border-ink-800">
      <Text className="text-base">{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: '#6366f1', false: '#c9c9d0' }}
      />
    </View>
  );
}
