import { Redirect } from 'expo-router';

/** Raiz autenticada → primeira aba. A home-hub de links virou a tab bar (ver app/(tabs)). */
export default function Index() {
  return <Redirect href="/collection" />;
}
