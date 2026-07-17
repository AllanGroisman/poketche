import type { ReactNode } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/**
 * Container base de tela — fundo sensível a tema (dark-first) e padding padrão do design system.
 * API preservada (`padded`) para as telas não mudarem. Respeita a safe area para tirar o conteúdo
 * de baixo do notch/status bar (parte da cara de "app de verdade").
 */
export function Screen({
  children,
  padded = true,
  scroll = false,
}: {
  children: ReactNode;
  padded?: boolean;
  scroll?: boolean;
}) {
  return (
    <SafeAreaView
      edges={scroll ? ['top'] : ['top', 'bottom']}
      className="flex-1 bg-ink-50 dark:bg-ink-950"
    >
      <View className={`flex-1 ${padded ? 'px-4 pt-2' : ''}`}>{children}</View>
    </SafeAreaView>
  );
}
