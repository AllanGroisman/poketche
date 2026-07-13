import { useColorScheme } from 'react-native';

/**
 * Paleta mínima sensível a tema (constituição VI — mobile-first, estados claros).
 * Ampliar quando o design system evoluir; por ora cobre texto, fundo, primário e erro.
 */
export interface ThemeColors {
  background: string;
  card: string;
  text: string;
  muted: string;
  primary: string;
  danger: string;
  border: string;
}

const light: ThemeColors = {
  background: '#ffffff',
  card: '#f5f5f7',
  text: '#111114',
  muted: '#6b6b73',
  primary: '#c0392b',
  danger: '#c0392b',
  border: '#e2e2e6',
};

const dark: ThemeColors = {
  background: '#111114',
  card: '#1c1c20',
  text: '#f2f2f5',
  muted: '#9a9aa2',
  primary: '#e5533c',
  danger: '#e5533c',
  border: '#2a2a30',
};

export function useThemeColors(): ThemeColors {
  return useColorScheme() === 'dark' ? dark : light;
}
