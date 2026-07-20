import { Stack } from 'expo-router';

/** Stack da aba Coleção: lista (index) → detalhes/editar/buscar empilham mantendo a tab bar. */
export default function CollectionStack() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
