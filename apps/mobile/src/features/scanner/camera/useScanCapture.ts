import { useCallback, useRef, useState } from 'react';
import type { Camera } from 'react-native-vision-camera';
import { ApiError } from '@/services/api';
import { addCapture } from '../api';
import { classifyCapture, playFeedback, type CaptureFeedback } from '../feedback';
import { cropCardToBase64 } from './crop';

/**
 * Captura de uma carta (T070): tira a foto, recorta na moldura, envia para identificação e produz
 * o feedback. Uma captura por vez — o `capturing` trava reentrância (o botão e o auto-captura
 * chamam o mesmo caminho).
 */
export function useScanCapture(
  sessionId: string,
  cameraRef: React.RefObject<Camera>,
  wishlistCardIds: ReadonlySet<string>,
  feedbackEnabled: boolean,
  initialCount = 0,
) {
  const [capturing, setCapturing] = useState(false);
  const [feedback, setFeedback] = useState<CaptureFeedback | null>(null);
  // Começa no que a sessão já tinha (recuperação) para o rótulo "Revisar (N)" não zerar.
  const [count, setCount] = useState(initialCount);
  const [error, setError] = useState<string | null>(null);
  // Lê o valor corrente da preferência sem recriar o callback a cada toggle.
  const feedbackEnabledRef = useRef(feedbackEnabled);
  feedbackEnabledRef.current = feedbackEnabled;

  const capture = useCallback(async () => {
    const cam = cameraRef.current;
    if (capturing || !cam) return;
    setCapturing(true);
    setError(null);
    try {
      const photo = await cam.takePhoto({ enableShutterSound: false, flash: 'off' });
      const base64 = await cropCardToBase64(photo.path, photo.width, photo.height);
      const res = await addCapture(sessionId, base64);
      const fb = classifyCapture(res, wishlistCardIds);
      setFeedback(fb);
      playFeedback(fb, feedbackEnabledRef.current);
      setCount((n) => n + 1);
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : 'Não foi possível capturar. Tente enquadrar de novo.',
      );
    } finally {
      setCapturing(false);
    }
  }, [sessionId, cameraRef, wishlistCardIds, capturing]);

  return { capture, capturing, feedback, count, error, setCount };
}
