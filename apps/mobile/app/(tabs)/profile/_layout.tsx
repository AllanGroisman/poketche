import { Stack } from 'expo-router';

/**
 * Stack da aba Perfil. Sem este arquivo a pasta não vira uma rota `profile` própria e o
 * `<Tabs.Screen name="profile">` não casa — a aba aparece como "profile/index", sem título nem ícone.
 */
export default function ProfileStack() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
