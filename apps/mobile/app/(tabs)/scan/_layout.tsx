import { Stack } from 'expo-router';

/** Stack da aba Escanear: câmera (index) → revisão/gravação empilham. */
export default function ScanStack() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
