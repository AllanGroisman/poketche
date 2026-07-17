import { useCallback, useEffect, useRef, useState } from 'react';
import type { Camera } from 'react-native-vision-camera';
import { isRecordingPreferred, setRecordingPreferred, setSessionRecordingUri } from './storage';

/**
 * Grava a sessão de escaneamento (T074, FR-062/FR-063/FR-066) — opt-in, sem áudio (o mic nunca é
 * pedido: decisão do spike). O vídeo é do vision-camera e fica no aparelho; só guardamos o caminho.
 *
 * **Capacidade e degradação (FR-063)**: nem todo aparelho grava vídeo e tira foto ao mesmo tempo.
 * Não dá para saber isso com certeza sem tentar, então tratamos toda falha (erro da câmera, erro da
 * gravação, exceção ao iniciar) como "sem capacidade": desliga a gravação e avisa, em vez de
 * degradar a captura. É o comportamento que o FR-063 especifica.
 *
 * **Sincronismo do início**: ligar a gravação ativa o modo vídeo da câmera, que reconfigura o
 * pipeline. Iniciamos a gravação com um pequeno atraso após o `onInitialized` para o pipeline
 * assentar — este atraso é o ponto de ajuste na validação em aparelho (o spike do T074).
 */

/** Atraso (ms) entre ativar o vídeo e iniciar a gravação, para o pipeline reconfigurar. */
const START_DELAY_MS = 700;

export interface SessionRecording {
  /** Preferência opt-in ligada (o modo vídeo da câmera fica ativo). */
  enabled: boolean;
  /** Gravando de fato agora. */
  recording: boolean;
  /** Aparelho/formato não suporta — gravação desativada com aviso (FR-063). */
  unavailable: boolean;
  onToggle: () => void;
  onCameraInitialized: () => void;
  onCameraError: () => void;
}

export function useSessionRecording(
  sessionId: string,
  cameraRef: React.RefObject<Camera>,
): SessionRecording {
  const [enabled, setEnabled] = useState(false);
  const [recording, setRecording] = useState(false);
  const [ready, setReady] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  // Espelho do estado para o cleanup de desmontagem, que roda uma vez só.
  const recordingRef = useRef(false);
  recordingRef.current = recording;

  useEffect(() => {
    void isRecordingPreferred().then(setEnabled);
  }, []);

  // Inicia a gravação quando o vídeo está ligado e a câmera já inicializou.
  useEffect(() => {
    if (!enabled || unavailable || !ready || recording) return;
    const t = setTimeout(() => {
      const cam = cameraRef.current;
      if (!cam) return;
      try {
        cam.startRecording({
          onRecordingFinished: (video) => {
            setRecording(false);
            const uri = video.path.startsWith('file://') ? video.path : `file://${video.path}`;
            void setSessionRecordingUri(sessionId, uri);
          },
          onRecordingError: () => {
            setRecording(false);
            setUnavailable(true);
          },
        });
        setRecording(true);
      } catch {
        setUnavailable(true);
      }
    }, START_DELAY_MS);
    return () => clearTimeout(t);
  }, [enabled, unavailable, ready, recording, cameraRef, sessionId]);

  // Para a gravação ao sair da tela — o vídeo fica salvo pelo `onRecordingFinished`.
  useEffect(
    () => () => {
      const cam = cameraRef.current;
      if (cam && recordingRef.current) void cam.stopRecording().catch(() => {});
    },
    [cameraRef],
  );

  const onToggle = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      void setRecordingPreferred(next);
      if (!next && recordingRef.current) {
        const cam = cameraRef.current;
        if (cam) void cam.stopRecording().catch(() => {});
      }
      return next;
    });
  }, [cameraRef]);

  const onCameraInitialized = useCallback(() => setReady(true), []);
  // Erro da câmera com vídeo ligado → sem capacidade (FR-063).
  const onCameraError = useCallback(() => {
    setUnavailable(true);
    setEnabled(false);
    setRecording(false);
  }, []);

  return { enabled, recording, unavailable, onToggle, onCameraInitialized, onCameraError };
}
