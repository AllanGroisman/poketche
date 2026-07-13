import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useThemeColors } from './theme';

/**
 * Estados padrão de tela — loading, erro (com retry) e vazio. Constituição VI:
 * toda tela que carrega dados deve cobrir estes três casos.
 */

export function LoadingState({ label = 'Carregando…' }: { label?: string }) {
  const c = useThemeColors();
  return (
    <View style={styles.center}>
      <ActivityIndicator color={c.primary} />
      <Text style={[styles.muted, { color: c.muted }]}>{label}</Text>
    </View>
  );
}

export function ErrorState({
  message = 'Algo deu errado.',
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  const c = useThemeColors();
  return (
    <View style={styles.center}>
      <Text style={[styles.title, { color: c.text }]}>Ops</Text>
      <Text style={[styles.muted, { color: c.muted }]}>{message}</Text>
      {onRetry ? (
        <Pressable
          accessibilityRole="button"
          onPress={onRetry}
          style={[styles.button, { borderColor: c.border }]}
        >
          <Text style={{ color: c.primary, fontWeight: '600' }}>Tentar de novo</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function EmptyState({ title = 'Nada aqui ainda', hint }: { title?: string; hint?: string }) {
  const c = useThemeColors();
  return (
    <View style={styles.center}>
      <Text style={[styles.title, { color: c.text }]}>{title}</Text>
      {hint ? <Text style={[styles.muted, { color: c.muted }]}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 },
  title: { fontSize: 18, fontWeight: '700' },
  muted: { fontSize: 14, textAlign: 'center' },
  button: {
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
    borderWidth: 1,
  },
});
