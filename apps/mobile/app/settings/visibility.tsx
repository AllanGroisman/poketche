import { useState } from 'react';
import { Switch, View } from 'react-native';
import { Stack } from 'expo-router';
import { AsyncBoundary, Screen, Text, Card, Button } from '@/components';
import { useAsync } from '@/lib/useAsync';
import {
  generateShareLink,
  getVisibility,
  revokeShareLink,
  updateVisibility,
  type Visibility,
} from '@/features/account/api';

export default function VisibilityScreen() {
  const state = useAsync(getVisibility, []);
  return (
    <Screen>
      <Stack.Screen options={{ headerShown: true, title: 'Visibilidade' }} />
      <AsyncBoundary state={state} loadingLabel="Carregando…">
        {(initial) => <Editor initial={initial} />}
      </AsyncBoundary>
    </Screen>
  );
}

function Editor({ initial }: { initial: Visibility }) {
  const [vis, setVis] = useState<Visibility>(initial);
  const [busy, setBusy] = useState(false);

  async function toggle(key: 'show_cards' | 'show_values' | 'show_quantities', value: boolean) {
    setVis((v) => ({ ...v, [key]: value })); // otimista
    try {
      const updated = await updateVisibility({ [key]: value });
      setVis(updated);
    } catch {
      setVis((v) => ({ ...v, [key]: !value })); // reverte
    }
  }

  async function run(action: 'generate' | 'revoke') {
    setBusy(true);
    try {
      setVis(action === 'generate' ? await generateShareLink() : await revokeShareLink());
    } finally {
      setBusy(false);
    }
  }

  const isPublic = vis.status === 'public_link' && vis.share_url;

  return (
    <View className="flex-1 gap-1 pt-2">
      <Row
        label="Mostrar cartas"
        value={vis.show_cards}
        onChange={(v) => toggle('show_cards', v)}
      />
      <Row
        label="Mostrar valores"
        value={vis.show_values}
        onChange={(v) => toggle('show_values', v)}
      />
      <Row
        label="Mostrar quantidades"
        value={vis.show_quantities}
        onChange={(v) => toggle('show_quantities', v)}
      />

      <Card pad="lg" className="mt-6 gap-3">
        <Text weight="bold" className="text-lg">
          Link público
        </Text>
        {isPublic ? (
          <>
            <Text selectable tone="muted" className="text-sm">
              {vis.share_url}
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
              Sua coleção está privada. Gere um link para compartilhar.
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
