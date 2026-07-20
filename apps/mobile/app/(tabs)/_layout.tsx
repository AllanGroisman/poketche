import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'nativewind';

/**
 * Bottom tabs do app autenticado (US1+). Substitui a home-hub de links manuais por navegação
 * persistente. Cada aba é um Stack (ver os `_layout.tsx` das subpastas) para empilhar detalhe/edição
 * sem perder o estado da aba. Cores vêm dos tokens do design system (tailwind.config.js).
 */
type IconName = keyof typeof Ionicons.glyphMap;

const palette = {
  light: { bg: '#ffffff', border: '#e2e2e6', active: '#4f46e5', inactive: '#9a9aa2' },
  dark: { bg: '#1c1c20', border: '#26262b', active: '#818cf8', inactive: '#6b6b73' },
};

function tabIcon(focused: IconName, unfocused: IconName) {
  return ({
    color,
    size,
    focused: isFocused,
  }: {
    color: string;
    size: number;
    focused: boolean;
  }) => <Ionicons name={isFocused ? focused : unfocused} size={size} color={color} />;
}

export default function TabsLayout() {
  const { colorScheme } = useColorScheme();
  const c = palette[colorScheme === 'dark' ? 'dark' : 'light'];

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.active,
        tabBarInactiveTintColor: c.inactive,
        tabBarStyle: {
          backgroundColor: c.bg,
          borderTopColor: c.border,
          height: 62,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontFamily: 'Inter_500Medium', fontSize: 11 },
      }}
    >
      <Tabs.Screen
        name="collection"
        options={{ title: 'Coleção', tabBarIcon: tabIcon('albums', 'albums-outline') }}
      />
      <Tabs.Screen
        name="explore"
        options={{ title: 'Explorar', tabBarIcon: tabIcon('compass', 'compass-outline') }}
      />
      <Tabs.Screen
        name="scan"
        options={{ title: 'Escanear', tabBarIcon: tabIcon('scan', 'scan-outline') }}
      />
      <Tabs.Screen
        name="wishlists"
        options={{ title: 'Wishlist', tabBarIcon: tabIcon('heart', 'heart-outline') }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Perfil', tabBarIcon: tabIcon('person', 'person-outline') }}
      />
    </Tabs>
  );
}
