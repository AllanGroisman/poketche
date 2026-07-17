import { useState } from 'react';
import { Alert, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { AsyncBoundary, EmptyState, Screen, Button } from '@/components';
import { useAsync } from '@/lib/useAsync';
import {
  getSessionRecordingUri,
  setSessionRecordingUri,
} from '@/features/scanner/recording/storage';

/**
 * Vídeo da sessão de escaneamento (T074, FR-062/FR-066): assistir, salvar na galeria, compartilhar
 * ou descartar. O arquivo **nunca sai do aparelho por conta própria** — só o usuário decide
 * salvar/compartilhar; nada sobe para a API.
 */
export default function RecordingScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const state = useAsync(() => getSessionRecordingUri(sessionId), [sessionId]);

  return (
    <Screen>
      <Stack.Screen options={{ headerShown: true, title: 'Gravação' }} />
      <AsyncBoundary state={state} loadingLabel="Carregando gravação…">
        {(uri) =>
          uri ? (
            <RecordingPlayer uri={uri} sessionId={sessionId} />
          ) : (
            <EmptyState
              title="Sem gravação"
              hint="Esta sessão não foi gravada, ou o vídeo já foi descartado."
            />
          )
        }
      </AsyncBoundary>
    </Screen>
  );
}

/** Player e ações — separado para chamar `useVideoPlayer` com a uri já resolvida. */
function RecordingPlayer({ uri, sessionId }: { uri: string; sessionId: string }) {
  const [busy, setBusy] = useState(false);
  const player = useVideoPlayer(uri);

  async function onSave() {
    if (busy) return;
    setBusy(true);
    try {
      const perm = await MediaLibrary.requestPermissionsAsync(true);
      if (!perm.granted) {
        Alert.alert('Permissão negada', 'Não foi possível salvar sem acesso à galeria.');
        return;
      }
      await MediaLibrary.saveToLibraryAsync(uri);
      Alert.alert('Salvo', 'O vídeo foi salvo na sua galeria.');
    } catch {
      Alert.alert('Não foi possível salvar. Tente de novo.');
    } finally {
      setBusy(false);
    }
  }

  async function onShare() {
    if (busy) return;
    setBusy(true);
    try {
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert('Indisponível', 'Compartilhamento não está disponível neste aparelho.');
        return;
      }
      await Sharing.shareAsync(uri);
    } catch {
      Alert.alert('Não foi possível compartilhar. Tente de novo.');
    } finally {
      setBusy(false);
    }
  }

  function onDiscard() {
    Alert.alert('Descartar gravação', 'O vídeo desta sessão será removido. Continuar?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Descartar',
        style: 'destructive',
        onPress: async () => {
          // Limpa a referência; o arquivo fica no cache do app e é reciclado pelo SO.
          await setSessionRecordingUri(sessionId, null);
          router.back();
        },
      },
    ]);
  }

  return (
    <View className="flex-1 gap-4">
      <VideoView
        player={player}
        nativeControls
        allowsFullscreen
        className="aspect-[9/16] w-full rounded-md bg-ink-950"
      />
      <View className="gap-2.5">
        <Button
          title="Salvar na galeria"
          size="lg"
          fullWidth
          disabled={busy}
          onPress={() => void onSave()}
        />
        <Button
          title="Compartilhar"
          variant="outline"
          size="lg"
          fullWidth
          disabled={busy}
          onPress={() => void onShare()}
        />
        <Button title="Descartar" variant="ghost" fullWidth disabled={busy} onPress={onDiscard} />
      </View>
    </View>
  );
}
