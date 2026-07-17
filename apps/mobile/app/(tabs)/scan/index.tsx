import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, router } from 'expo-router';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  type CameraDevice,
} from 'react-native-vision-camera';
import { ErrorState, LoadingState, Text } from '@/components';
import { ApiError } from '@/services/api';
import {
  getRememberedCamera,
  setLocalPendingSessionId,
  setRememberedCamera,
} from '@/services/scan-session-storage';
import {
  createSession,
  getPendingSession,
  patchSession,
  type CameraSide,
  type ScanSession,
} from '@/features/scanner/api';
import {
  isFeedbackEnabled,
  loadWishlistCardIds,
  setFeedbackEnabled,
} from '@/features/scanner/feedback';
import { GUIDE_WIDTH_FRACTION } from '@/features/scanner/camera/crop';
import { useScanCapture } from '@/features/scanner/camera/useScanCapture';
import { useSessionRecording } from '@/features/scanner/recording/useSessionRecording';

/** Intervalo (s) entre capturas automáticas (FR-021: captura com contador). */
const AUTO_INTERVAL = 3;

/**
 * Tela da câmera (T070/T073, FR-021/FR-059): recupera a sessão pendente ou cria uma nova, mostra a
 * moldura-guia no formato de carta e captura (manual ou automática com contador). Nada entra na
 * coleção aqui — as capturas viram rascunho e a revisão decide.
 *
 * Esta tela **não** segue a paleta clara/escura: os controles ficam sobre o feed da câmera, então
 * branco-sobre-escuro é a leitura correta nos dois temas. Só a fonte e o accent vêm do design system.
 */
export default function ScanScreen() {
  const [session, setSession] = useState<ScanSession | null>(null);
  const [initError, setInitError] = useState<string | null>(null);
  const [cameraSide, setCameraSide] = useState<CameraSide>('back');
  const [wishlistCardIds, setWishlistCardIds] = useState<ReadonlySet<string>>(new Set());
  const [fbEnabled, setFbEnabled] = useState(true);

  const device = useCameraDevice(cameraSide);
  const { hasPermission, requestPermission } = useCameraPermission();

  useEffect(() => {
    if (!hasPermission) void requestPermission();
  }, [hasPermission, requestPermission]);

  // Resolve a sessão (recuperar pendente ou criar) e carrega preferências uma vez.
  const init = useCallback(async () => {
    setInitError(null);
    try {
      const [remembered, enabled] = await Promise.all([getRememberedCamera(), isFeedbackEnabled()]);
      setCameraSide(remembered);
      setFbEnabled(enabled);

      const pending = await getPendingSession();
      const active = pending ?? (await createSession(remembered));
      setSession(active);
      setCameraSide(active.camera);
      await setLocalPendingSessionId(active.id);
      // Wishlist para o feedback celebratório — falha vira conjunto vazio.
      setWishlistCardIds(await loadWishlistCardIds());
    } catch (e) {
      setInitError(e instanceof ApiError ? e.message : 'Não foi possível iniciar o scanner.');
    }
  }, []);

  useEffect(() => {
    void init();
  }, [init]);

  if (initError) {
    return (
      <View className="flex-1 bg-ink-950">
        <Stack.Screen options={{ headerShown: true, title: 'Escanear' }} />
        <ErrorState message={initError} onRetry={() => void init()} />
      </View>
    );
  }
  if (!hasPermission) {
    return (
      <View className="flex-1 bg-ink-950">
        <Stack.Screen options={{ headerShown: true, title: 'Escanear' }} />
        <ErrorState
          message="Precisamos da câmera para escanear suas cartas."
          onRetry={() => void requestPermission()}
        />
      </View>
    );
  }
  if (!session || !device) {
    return (
      <View className="flex-1 bg-ink-950">
        <Stack.Screen options={{ headerShown: true, title: 'Escanear' }} />
        <LoadingState label={device ? 'Iniciando sessão…' : 'Abrindo a câmera…'} />
      </View>
    );
  }

  return (
    <CameraStage
      session={session}
      device={device}
      cameraSide={cameraSide}
      wishlistCardIds={wishlistCardIds}
      fbEnabled={fbEnabled}
      onToggleFeedback={async () => {
        const next = !fbEnabled;
        setFbEnabled(next);
        await setFeedbackEnabled(next);
      }}
      onFlip={async () => {
        const next: CameraSide = cameraSide === 'back' ? 'front' : 'back';
        setCameraSide(next);
        await setRememberedCamera(next);
        // Persistir a câmera na sessão é acessório — não trava a troca se a rede falhar.
        void patchSession(session.id, { camera: next }).catch(() => {});
      }}
    />
  );
}

/** Palco da câmera já com sessão/dispositivo resolvidos — permite chamar os hooks sem condicional. */
function CameraStage({
  session,
  device,
  cameraSide,
  wishlistCardIds,
  fbEnabled,
  onToggleFeedback,
  onFlip,
}: {
  session: ScanSession;
  device: CameraDevice;
  cameraSide: CameraSide;
  wishlistCardIds: ReadonlySet<string>;
  fbEnabled: boolean;
  onToggleFeedback: () => void;
  onFlip: () => void;
}) {
  const cameraRef = useRef<Camera>(null);
  const { capture, capturing, feedback, count, error } = useScanCapture(
    session.id,
    cameraRef,
    wishlistCardIds,
    fbEnabled,
    session.capture_count ?? 0,
  );

  const rec = useSessionRecording(session.id, cameraRef);

  const [autoOn, setAutoOn] = useState(false);
  const [countdown, setCountdown] = useState(AUTO_INTERVAL);

  // Aviso único quando o aparelho não suporta gravar (FR-063).
  useEffect(() => {
    if (rec.unavailable) {
      Alert.alert(
        'Gravação indisponível',
        'Este aparelho não consegue gravar o vídeo sem prejudicar a leitura das cartas. A gravação foi desligada.',
      );
    }
  }, [rec.unavailable]);

  // Captura automática com contador: decrementa a cada segundo e dispara em 0; pausa enquanto uma
  // captura corre (FR-021). Desligar reseta o contador.
  useEffect(() => {
    if (!autoOn) {
      setCountdown(AUTO_INTERVAL);
      return;
    }
    if (capturing) return;
    if (countdown <= 0) {
      void capture();
      setCountdown(AUTO_INTERVAL);
      return;
    }
    const t = setTimeout(() => setCountdown((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [autoOn, countdown, capturing, capture]);

  return (
    <View className="flex-1 bg-ink-950">
      <Stack.Screen options={{ headerShown: true, title: 'Escanear' }} />
      <Camera
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive
        photo
        // Vídeo só quando a gravação opt-in está ligada e o aparelho suporta (FR-063). Sem áudio:
        // o mic nunca é pedido (decisão do spike do T074).
        video={rec.enabled && !rec.unavailable}
        audio={false}
        onInitialized={rec.onCameraInitialized}
        onError={rec.onCameraError}
      />

      {/* Moldura-guia no formato de carta (T070). */}
      <View className="absolute inset-0 items-center justify-center" pointerEvents="none">
        <View className="items-center gap-3">
          <View
            className="rounded-lg border-[3px] border-white/90"
            style={{ width: `${GUIDE_WIDTH_FRACTION * 100}%`, aspectRatio: 63 / 88 }}
          />
          <Text weight="semibold" className="text-sm text-white/85">
            Alinhe a carta na moldura
          </Text>
        </View>
      </View>

      {/* Feedback da última captura (T071). */}
      {feedback ? (
        <View
          className={`absolute top-[90px] max-w-[86%] self-center rounded-lg px-4 py-2.5 ${
            feedback.celebratory ? 'bg-success' : 'bg-black/70'
          }`}
          pointerEvents="none"
        >
          <Text weight="extrabold" className="text-center text-white">
            {feedback.title}
          </Text>
          <Text className="mt-0.5 text-center text-sm text-white">{feedback.detail}</Text>
        </View>
      ) : null}
      {error ? (
        <View
          className="absolute top-[90px] max-w-[86%] self-center rounded-lg bg-danger px-4 py-2.5"
          pointerEvents="none"
        >
          <Text weight="extrabold" className="text-center text-white">
            {error}
          </Text>
        </View>
      ) : null}

      {/* Indicador de gravação em andamento (T074). */}
      {rec.recording ? (
        <View
          className="absolute top-[60px] flex-row items-center gap-1.5 self-center rounded-lg bg-black/55 px-3 py-1"
          pointerEvents="none"
        >
          <View className="h-2.5 w-2.5 rounded-full bg-danger" />
          <Text weight="extrabold" className="text-xs tracking-widest text-white">
            REC
          </Text>
        </View>
      ) : null}

      {/* Barra superior: contadores e toggles. */}
      <View className="absolute left-4 right-4 top-4 flex-row justify-between">
        <OverlayChip
          icon="camera-reverse-outline"
          label={cameraSide === 'back' ? 'Frontal' : 'Traseira'}
          onPress={onFlip}
        />
        <View className="flex-row gap-2">
          {!rec.unavailable ? (
            <OverlayChip
              icon={rec.enabled ? 'radio-button-on' : 'radio-button-off'}
              label={rec.enabled ? 'Gravando' : 'Gravar'}
              onPress={rec.onToggle}
            />
          ) : null}
          <OverlayChip
            icon={fbEnabled ? 'notifications' : 'notifications-off'}
            label={fbEnabled ? 'Sons on' : 'Sons off'}
            onPress={onToggleFeedback}
          />
        </View>
      </View>

      {/* Controles inferiores. */}
      <View className="absolute bottom-10 left-6 right-6 flex-row items-center justify-between">
        <Pressable
          accessibilityRole="button"
          onPress={() => setAutoOn((v) => !v)}
          className={`min-w-[84px] items-center rounded-full border-2 bg-black/40 px-3.5 py-2.5 ${
            autoOn ? 'border-brand-500' : 'border-white/50'
          }`}
        >
          <Text weight="bold" className="text-sm text-white">
            {autoOn ? `Auto ${capturing ? '…' : countdown}` : 'Auto off'}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => void capture()}
          disabled={capturing}
          className={`h-[76px] w-[76px] items-center justify-center rounded-full border-[5px] border-white ${
            capturing ? 'opacity-50' : ''
          }`}
          accessibilityRole="button"
          accessibilityLabel="Capturar carta"
        >
          <View className="h-[58px] w-[58px] rounded-full bg-white" />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={() =>
            router.push({ pathname: '/scan/review', params: { sessionId: session.id } })
          }
          className={`min-w-[84px] items-center rounded-full px-3.5 py-2.5 ${
            count > 0 ? 'bg-brand-600' : 'bg-black/50'
          }`}
        >
          <Text weight="bold" className="text-sm text-white">
            Revisar{count > 0 ? ` (${count})` : ''}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

/** Pílula de controle sobre o feed da câmera — sempre clara, nunca temática. */
function OverlayChip({
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
      className="flex-row items-center gap-1.5 rounded-full bg-black/50 px-3.5 py-2 active:opacity-70"
    >
      <Ionicons name={icon} size={15} color="#fff" />
      <Text weight="semibold" className="text-sm text-white">
        {label}
      </Text>
    </Pressable>
  );
}
