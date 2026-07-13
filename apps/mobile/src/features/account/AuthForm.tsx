import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Link } from 'expo-router';
import { Screen, useThemeColors } from '@/components';

/**
 * Formulário de e-mail/senha reutilizado por login e cadastro (US1). Cobre estados de
 * carregando e erro (constituição VI). O submit é delegado (Supabase) pelo chamador.
 */
export function AuthForm({
  title,
  cta,
  onSubmit,
  altText,
  altHref,
  altLabel,
  hint,
}: {
  title: string;
  cta: string;
  onSubmit: (email: string, password: string) => Promise<void>;
  altText: string;
  altHref: string;
  altLabel: string;
  hint?: string;
}) {
  const c = useThemeColors();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = email.includes('@') && password.length >= 6 && !loading;

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      await onSubmit(email.trim(), password);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao entrar.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen>
      <View style={styles.container}>
        <Text style={[styles.title, { color: c.text }]}>{title}</Text>

        <TextInput
          style={[styles.input, { color: c.text, borderColor: c.border, backgroundColor: c.card }]}
          placeholder="E-mail"
          placeholderTextColor={c.muted}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={[styles.input, { color: c.text, borderColor: c.border, backgroundColor: c.card }]}
          placeholder="Senha (mín. 6)"
          placeholderTextColor={c.muted}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        {hint ? <Text style={[styles.hint, { color: c.muted }]}>{hint}</Text> : null}
        {error ? <Text style={[styles.error, { color: c.danger }]}>{error}</Text> : null}

        <Pressable
          accessibilityRole="button"
          disabled={!canSubmit}
          onPress={submit}
          style={[styles.button, { backgroundColor: c.primary, opacity: canSubmit ? 1 : 0.5 }]}
        >
          <Text style={styles.buttonText}>{loading ? 'Aguarde…' : cta}</Text>
        </Pressable>

        <View style={styles.altRow}>
          <Text style={{ color: c.muted }}>{altText} </Text>
          <Link href={altHref} style={{ color: c.primary, fontWeight: '600' }}>
            {altLabel}
          </Link>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', gap: 12 },
  title: { fontSize: 26, fontWeight: '700', marginBottom: 8 },
  input: { borderWidth: 1, borderRadius: 10, padding: 14, fontSize: 16 },
  hint: { fontSize: 13 },
  error: { fontSize: 14 },
  button: { marginTop: 8, padding: 15, borderRadius: 10, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  altRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 12 },
});
