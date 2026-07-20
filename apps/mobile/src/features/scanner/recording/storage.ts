import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Estado local da gravação da sessão (T074, FR-062/FR-066). O vídeo **nunca sai do aparelho**:
 * guardamos apenas o caminho do arquivo local, por sessão, e a preferência opt-in de gravar.
 * Nada disso vai para a API.
 */

const ENABLED_KEY = 'scan.recordingEnabled';
const videoKey = (sessionId: string) => `scan.recording.${sessionId}`;

/** Gravação é **opt-in**: default desligada (FR-062). */
export async function isRecordingPreferred(): Promise<boolean> {
  return (await AsyncStorage.getItem(ENABLED_KEY)) === 'true';
}

export async function setRecordingPreferred(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(ENABLED_KEY, enabled ? 'true' : 'false');
}

/** Caminho local (`file://…`) do vídeo gravado para a sessão, se houver. */
export async function getSessionRecordingUri(sessionId: string): Promise<string | null> {
  return AsyncStorage.getItem(videoKey(sessionId));
}

export async function setSessionRecordingUri(sessionId: string, uri: string | null): Promise<void> {
  if (uri) await AsyncStorage.setItem(videoKey(sessionId), uri);
  else await AsyncStorage.removeItem(videoKey(sessionId));
}
