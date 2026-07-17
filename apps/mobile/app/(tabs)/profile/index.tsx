import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { AsyncBoundary, Screen, Text, Card, Button, ListRow } from '@/components';
import { useAsync } from '@/lib/useAsync';
import { getMe } from '@/features/account/api';
import { getPendingSession } from '@/features/scanner/api';
import { signOut } from '@/services/auth';

/**
 * Aba Perfil — absorve a antiga home-hub: identidade, recuperação de scan pendente (FR-059) e os
 * acessos que não viraram aba (estatísticas, visibilidade), além do logout. Coleção/Explorar/Scan/
 * Wishlist agora vivem na tab bar.
 */
export default function ProfileTab() {
  const state = useAsync(getMe, []);
  const pending = useAsync(getPendingSession, []);

  return (
    <Screen scroll>
      <AsyncBoundary state={state} loadingLabel="Carregando perfil…">
        {(profile) => (
          <View className="flex-1 gap-4 pt-2">
            <View className="gap-0.5">
              <Text tone="muted">Olá,</Text>
              <Text weight="extrabold" className="text-3xl">
                {profile.display_name}
              </Text>
            </View>

            {pending.data ? (
              <Card
                pad="md"
                onPress={() =>
                  router.push({
                    pathname: '/scan/review',
                    params: { sessionId: pending.data!.id },
                  })
                }
                className="border-brand-300 dark:border-brand-800"
              >
                <View className="flex-row items-center gap-3">
                  <Ionicons name="scan-outline" size={22} color="#6366f1" />
                  <View className="flex-1">
                    <Text weight="bold">Escaneamento em andamento</Text>
                    <Text tone="muted" className="text-sm">
                      {pending.data.capture_count ?? 0} carta(s) aguardando revisão — toque para
                      retomar.
                    </Text>
                  </View>
                </View>
              </Card>
            ) : null}

            <View className="gap-2">
              <ListRow
                title="Estatísticas da coleção"
                subtitle="Valor, evolução, rankings e completude"
                leading={<Ionicons name="stats-chart-outline" size={22} color="#6366f1" />}
                trailing={<Ionicons name="chevron-forward" size={18} color="#9a9aa2" />}
                onPress={() => router.push('/dashboard')}
              />
              <ListRow
                title="Visibilidade e link público"
                subtitle="Controle o que aparece no seu link"
                leading={<Ionicons name="share-social-outline" size={22} color="#6366f1" />}
                trailing={<Ionicons name="chevron-forward" size={18} color="#9a9aa2" />}
                onPress={() => router.push('/settings/visibility')}
              />
            </View>

            <View className="mt-auto pb-2">
              <Button title="Sair" variant="outline" onPress={() => signOut()} />
            </View>
          </View>
        )}
      </AsyncBoundary>
    </Screen>
  );
}
