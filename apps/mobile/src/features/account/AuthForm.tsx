import { useState } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import { Screen, Text, Input, Button } from '@/components';

/**
 * Formulário de e-mail/senha reutilizado por login e cadastro (US1). Cobre estados de carregando e
 * erro (constituição VI). O submit é delegado (Supabase) pelo chamador. Repaginado com o design
 * system (Input/Button/Text) — some o `#fff` hardcoded e os literais soltos.
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
      <View className="flex-1 justify-center gap-3">
        <View className="mb-4 items-center gap-2">
          <View className="h-16 w-16 items-center justify-center rounded-2xl bg-brand-600">
            <Ionicons name="albums" size={32} color="#fff" />
          </View>
          <Text weight="extrabold" className="text-3xl">
            {title}
          </Text>
        </View>

        <Input
          label="E-mail"
          placeholder="voce@email.com"
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          value={email}
          onChangeText={setEmail}
        />
        <Input
          label="Senha"
          placeholder="Mínimo 6 caracteres"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        {hint ? (
          <Text tone="muted" className="text-sm">
            {hint}
          </Text>
        ) : null}
        {error ? (
          <Text tone="danger" className="text-sm">
            {error}
          </Text>
        ) : null}

        <Button
          title={loading ? 'Aguarde…' : cta}
          size="lg"
          fullWidth
          loading={loading}
          disabled={!canSubmit}
          onPress={submit}
          className="mt-2"
        />

        <View className="mt-3 flex-row justify-center">
          <Text tone="muted">{altText} </Text>
          <Link href={altHref} asChild>
            <Text weight="semibold" tone="brand">
              {altLabel}
            </Text>
          </Link>
        </View>
      </View>
    </Screen>
  );
}
