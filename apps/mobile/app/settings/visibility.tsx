import { useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { AsyncBoundary, Screen, useThemeColors } from '@/components';
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
  const c = useThemeColors();
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
    <View style={styles.container}>
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

      <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
        <Text style={[styles.cardTitle, { color: c.text }]}>Link público</Text>
        {isPublic ? (
          <>
            <Text selectable style={[styles.url, { color: c.muted }]}>
              {vis.share_url}
            </Text>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => run('revoke')}
              style={[styles.btn, { borderColor: c.border }]}
            >
              <Text style={{ color: c.danger, fontWeight: '600' }}>Revogar link</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={[styles.url, { color: c.muted }]}>
              Sua coleção está privada. Gere um link para compartilhar.
            </Text>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => run('generate')}
              style={[styles.btn, { backgroundColor: c.primary, borderColor: c.primary }]}
            >
              <Text style={{ color: '#fff', fontWeight: '700' }}>Gerar link público</Text>
            </Pressable>
          </>
        )}
      </View>
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
  const c = useThemeColors();
  return (
    <View style={[styles.row, { borderColor: c.border }]}>
      <Text style={[styles.rowLabel, { color: c.text }]}>{label}</Text>
      <Switch value={value} onValueChange={onChange} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 8, gap: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowLabel: { fontSize: 16 },
  card: { marginTop: 24, padding: 16, borderRadius: 12, borderWidth: 1, gap: 12 },
  cardTitle: { fontSize: 16, fontWeight: '700' },
  url: { fontSize: 14 },
  btn: { padding: 12, borderRadius: 10, borderWidth: 1, alignItems: 'center' },
});
