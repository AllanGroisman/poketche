import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { AsyncBoundary, EmptyState, Screen, Text, Button } from '@/components';
import { useAsync } from '@/lib/useAsync';
import { ApiError } from '@/services/api';
import { setLocalPendingSessionId } from '@/services/scan-session-storage';
import { getSessionRecordingUri } from '@/features/scanner/recording/storage';
import { promptWishlistRemoval } from '@/features/wishlist/removal-prompt';
import {
  confirmSession,
  discardSession,
  getSession,
  getSummary,
  patchCapture,
  type ScanCapture,
  type ScanSessionDetail,
  type ScanSummary,
} from '@/features/scanner/api';
import { CaptureRow } from '@/features/scanner/review/CaptureRow';
import { ManualAdd } from '@/features/scanner/review/ManualAdd';
import { ReviewSummary } from '@/features/scanner/review/ReviewSummary';

interface ReviewData {
  session: ScanSessionDetail;
  summary: ScanSummary;
}

/**
 * Revisão da sessão (T072, FR-056–FR-058): revisar/ajustar capturas, ver o resumo e confirmar
 * (grava na coleção) ou descartar. É obrigatória — nada entra sem passar por aqui.
 */
export default function ReviewScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const [working, setWorking] = useState(false);

  const load = useCallback(async (): Promise<ReviewData> => {
    const [session, summary] = await Promise.all([getSession(sessionId), getSummary(sessionId)]);
    return { session, summary };
  }, [sessionId]);
  const state = useAsync(load, [sessionId]);
  // Gravação da sessão (T074), se houver — entra a partir daqui.
  const recording = useAsync(() => getSessionRecordingUri(sessionId), [sessionId]);

  /** Define condição das identificadas ainda sem condição, num toque só (conveniência). */
  async function setAllNearMint(captures: ScanCapture[]) {
    const pending = captures.filter((x) => x.card && x.condition == null);
    if (pending.length === 0) return;
    setWorking(true);
    try {
      await Promise.all(
        pending.map((x) => patchCapture(sessionId, x.id, { condition: 'near_mint' })),
      );
      state.reload();
    } finally {
      setWorking(false);
    }
  }

  async function onConfirm() {
    if (working) return;
    setWorking(true);
    try {
      const res = await confirmSession(sessionId);
      await setLocalPendingSessionId(null);
      const done = () => router.replace('/collection');
      if (res.wishlist_matches.length > 0) {
        // A pergunta de wishlist decide a navegação (o usuário responde primeiro).
        promptWishlistRemoval(res.wishlist_matches, res.wishlist_auto_removed, done);
      } else {
        const extra = res.skipped_captures > 0 ? ` ${res.skipped_captures} ficaram a revisar.` : '';
        Alert.alert('Adicionadas à coleção', `${res.added_cards} carta(s) adicionada(s).${extra}`, [
          { text: 'OK', onPress: done },
        ]);
      }
    } catch (e) {
      Alert.alert(
        'Não foi possível confirmar',
        e instanceof ApiError ? e.message : 'Tente de novo.',
      );
      setWorking(false);
    }
  }

  function onDiscard() {
    Alert.alert('Descartar sessão', 'As cartas escaneadas serão perdidas. Continuar?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Descartar',
        style: 'destructive',
        onPress: async () => {
          setWorking(true);
          try {
            await discardSession(sessionId);
            await setLocalPendingSessionId(null);
            router.replace('/collection');
          } catch {
            Alert.alert('Não foi possível descartar. Tente de novo.');
            setWorking(false);
          }
        },
      },
    ]);
  }

  return (
    <Screen padded={false}>
      <Stack.Screen options={{ headerShown: true, title: 'Revisar' }} />
      <AsyncBoundary state={state} loadingLabel="Carregando sessão…">
        {({ session, summary }) => (
          <View className="flex-1">
            <FlatList
              data={session.captures}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ padding: 16, gap: 12 }}
              ListHeaderComponent={
                <View className="gap-3">
                  <ReviewSummary summary={summary} />
                  {recording.data ? (
                    <BulkAction
                      icon="play"
                      label="Ver gravação da sessão"
                      onPress={() =>
                        router.push({ pathname: '/scan/recording', params: { sessionId } })
                      }
                    />
                  ) : null}
                  {session.captures.some((x) => x.card && x.condition == null) ? (
                    <BulkAction
                      icon="checkmark-done"
                      label="Marcar pendentes como Near Mint"
                      onPress={() => void setAllNearMint(session.captures)}
                    />
                  ) : null}
                </View>
              }
              renderItem={({ item }) => (
                <CaptureRow sessionId={sessionId} capture={item} onChanged={state.reload} />
              )}
              ListEmptyComponent={
                <EmptyState
                  title="Nenhuma captura"
                  hint="Volte à câmera para escanear ou adicione uma carta manualmente."
                />
              }
              ListFooterComponent={
                <View className="mt-3">
                  <ManualAdd sessionId={sessionId} onAdded={state.reload} />
                </View>
              }
            />

            <View className="flex-row gap-3 border-t border-ink-200 bg-ink-50 p-4 dark:border-ink-800 dark:bg-ink-950">
              <View className="flex-1">
                <Button
                  title="Descartar"
                  variant="outline"
                  fullWidth
                  disabled={working}
                  onPress={onDiscard}
                />
              </View>
              <View className="flex-[2]">
                <Button
                  title={`Confirmar (${summary.total_cards})`}
                  size="lg"
                  fullWidth
                  loading={working}
                  disabled={working}
                  onPress={() => void onConfirm()}
                />
              </View>
            </View>
          </View>
        )}
      </AsyncBoundary>
    </Screen>
  );
}

/** Ação em lote no topo da revisão (gravação, condição em massa). */
function BulkAction({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="flex-row items-center justify-center gap-2 rounded-md border border-ink-200 p-2.5 active:opacity-70 dark:border-ink-700"
    >
      <Ionicons name={icon} size={16} color="#6366f1" />
      <Text weight="semibold" tone="brand" className="text-sm">
        {label}
      </Text>
    </Pressable>
  );
}
