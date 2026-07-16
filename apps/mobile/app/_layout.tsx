import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { LoadingState } from '@/components';
import { useSession } from '@/features/account/useSession';
import { takePendingReturn } from '@/services/auth-guard';

/** Rotas de visitante, acessíveis sem sessão (US7/US10, FR-003b/FR-068). */
const PUBLIC_SEGMENTS = ['public'];

/**
 * Layout raiz com gate de autenticação (US1): sem sessão → grupo (auth), exceto nas rotas
 * públicas; com sessão → app. Segue o padrão recomendado do expo-router (segments + replace).
 *
 * É aqui que a ação restrita de um visitante fecha o ciclo (FR-026a/SC-013): ao ganhar
 * sessão, o retorno guardado pelo auth-guard tem prioridade sobre a home.
 */
export default function RootLayout() {
  const { session, loading } = useSession();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const inAuthGroup = segments[0] === '(auth)';
    const isPublic = PUBLIC_SEGMENTS.includes(segments[0] ?? '');
    if (!session && !inAuthGroup && !isPublic) router.replace('/(auth)/login');
    else if (session && inAuthGroup) router.replace(takePendingReturn() ?? '/');
  }, [session, loading, segments, router]);

  return (
    <>
      <StatusBar style="auto" />
      {loading ? (
        <LoadingState label="Iniciando…" />
      ) : (
        <Stack screenOptions={{ headerShown: false }} />
      )}
    </>
  );
}
