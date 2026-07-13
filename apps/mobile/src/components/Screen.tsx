import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useThemeColors } from './theme';

/** Container base de tela com fundo sensível a tema e padding padrão. */
export function Screen({ children, padded = true }: { children: ReactNode; padded?: boolean }) {
  const c = useThemeColors();
  return (
    <View style={[styles.screen, { backgroundColor: c.background }, padded && styles.padded]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  padded: { padding: 16 },
});
