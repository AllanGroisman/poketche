import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { AsyncBoundary, Screen, useThemeColors } from '@/components';
import { useAsync } from '@/lib/useAsync';
import { getMe } from '@/features/account/api';
import { signOut } from '@/services/auth';

export default function Home() {
  const c = useThemeColors();
  const state = useAsync(getMe, []);

  return (
    <Screen>
      <AsyncBoundary state={state} loadingLabel="Carregando perfil…">
        {(profile) => (
          <View style={styles.container}>
            <Text style={[styles.hello, { color: c.muted }]}>Olá,</Text>
            <Text style={[styles.name, { color: c.text }]}>{profile.display_name}</Text>

            <Link href="/collection" style={[styles.link, { color: c.primary }]}>
              Minha coleção →
            </Link>
            <Link href="/settings/visibility" style={[styles.link, { color: c.primary }]}>
              Visibilidade e link público →
            </Link>

            <Pressable
              accessibilityRole="button"
              onPress={() => signOut()}
              style={[styles.logout, { borderColor: c.border }]}
            >
              <Text style={{ color: c.danger, fontWeight: '600' }}>Sair</Text>
            </Pressable>
          </View>
        )}
      </AsyncBoundary>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', gap: 8 },
  hello: { fontSize: 16 },
  name: { fontSize: 30, fontWeight: '800', marginBottom: 16 },
  link: { fontSize: 16, fontWeight: '600', marginTop: 8 },
  logout: {
    marginTop: 24,
    alignSelf: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    borderWidth: 1,
  },
});
