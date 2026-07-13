import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { LoadingState } from '@/components';
import { useSession } from '@/features/account/useSession';

/**
 * Layout raiz com gate de autenticação (US1): sem sessão → grupo (auth); com sessão →
 * app. Segue o padrão recomendado do expo-router (segments + replace).
 */
export default function RootLayout() {
  const { session, loading } = useSession();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const inAuthGroup = segments[0] === '(auth)';
    if (!session && !inAuthGroup) router.replace('/(auth)/login');
    else if (session && inAuthGroup) router.replace('/');
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
