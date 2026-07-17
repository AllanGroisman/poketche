import '../globals.css';
import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { LoadingState } from '@/components';
import { useSession } from '@/features/account/useSession';
import { useAppFonts } from '@/lib/useAppFonts';
import { takePendingReturn } from '@/services/auth-guard';
import { registerPushToken } from '@/services/push';

/**
 * Segmentos de visitante, acessíveis sem sessão (US7/US10, FR-003b/FR-068). Verificamos por
 * pertencimento (não `segments[0]`) porque `explore` agora vive dentro do grupo `(tabs)` — sem isso
 * o visitante deep-linkado cairia no login.
 */
const PUBLIC_SEGMENTS = ['public', 'explore'];

/**
 * Layout raiz com gate de autenticação (US1): sem sessão → grupo (auth), exceto nas rotas
 * públicas; com sessão → app. Segue o padrão recomendado do expo-router (segments + replace).
 *
 * É aqui que a ação restrita de um visitante fecha o ciclo (FR-026a/SC-013): ao ganhar
 * sessão, o retorno guardado pelo auth-guard tem prioridade sobre a home.
 */
export default function RootLayout() {
  const { session, loading } = useSession();
  const fontsLoaded = useAppFonts();
  const segments = useSegments();
  const router = useRouter();

  /**
   * O gate e o render precisam concordar sobre "pronto": o `<Stack>` só existe quando `ready`, e
   * navegar sem navegador montado é erro ("Attempted to navigate before mounting the Root Layout").
   * Com a fonte no cálculo, a sessão resolve antes dela e a janela deixa de ser teórica.
   */
  const ready = !loading && fontsLoaded;

  useEffect(() => {
    if (!ready) return;
    const inAuthGroup = segments[0] === '(auth)';
    const isPublic = segments.some((s) => PUBLIC_SEGMENTS.includes(s));
    if (!session && !inAuthGroup && !isPublic) router.replace('/(auth)/login');
    else if (session && inAuthGroup) router.replace(takePendingReturn() ?? '/collection');
  }, [session, ready, segments, router]);

  // Registra o aparelho para os alertas de preço-alvo (US9, T062). Só com sessão: o token é
  // vinculado ao usuário. O token pode ser rotacionado pelo sistema, então reenviamos a cada
  // login — o upsert do servidor é idempotente.
  useEffect(() => {
    if (session) void registerPushToken();
  }, [session]);

  return (
    <>
      <StatusBar style="auto" />
      {ready ? (
        <Stack screenOptions={{ headerShown: false }} />
      ) : (
        <LoadingState label="Iniciando…" />
      )}
    </>
  );
}
