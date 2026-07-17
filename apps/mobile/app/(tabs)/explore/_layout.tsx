import { Stack } from 'expo-router';

/** Stack da aba Explorar: edições (index) → grade → detalhe empilham mantendo a tab bar. */
export default function ExploreStack() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
