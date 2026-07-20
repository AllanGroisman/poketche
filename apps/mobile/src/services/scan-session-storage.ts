import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CameraSide } from '@/features/scanner/api';

/**
 * Estado local do scanner (US5, T073): a câmera lembrada (FR-061) e uma pista da sessão pendente
 * (FR-059). A **fonte da verdade** da recuperação é o servidor (`GET /scan/sessions/pending`) —
 * a sessão vive no backend, não aqui. Este cache local só serve para:
 *   - lembrar a câmera entre sessões sem uma ida à rede;
 *   - saber, na abertura, que havia uma sessão em andamento antes de a chamada de rede voltar.
 *
 * Nunca guardamos capturas nem imagens: o vídeo/opt-in de gravação nunca sai do aparelho (FR-066),
 * e as capturas já estão no servidor assim que enviadas.
 */

const CAMERA_KEY = 'scan.camera';
const PENDING_KEY = 'scan.pendingSessionId';

const isCameraSide = (v: string | null): v is CameraSide => v === 'back' || v === 'front';

/** Câmera lembrada; default `back` (FR-061). */
export async function getRememberedCamera(): Promise<CameraSide> {
  const stored = await AsyncStorage.getItem(CAMERA_KEY);
  return isCameraSide(stored) ? stored : 'back';
}

export async function setRememberedCamera(side: CameraSide): Promise<void> {
  await AsyncStorage.setItem(CAMERA_KEY, side);
}

/** Pista local da sessão pendente — confirmada contra o servidor na recuperação. */
export async function getLocalPendingSessionId(): Promise<string | null> {
  return AsyncStorage.getItem(PENDING_KEY);
}

export async function setLocalPendingSessionId(id: string | null): Promise<void> {
  if (id) await AsyncStorage.setItem(PENDING_KEY, id);
  else await AsyncStorage.removeItem(PENDING_KEY);
}
