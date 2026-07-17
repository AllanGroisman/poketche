import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
} from '@expo-google-fonts/inter';

/**
 * Carrega a fonte do design system (Inter, por peso) em runtime — sem asset nativo, funciona no dev
 * client sem rebuild. As famílias batem com as chaves de `fontFamily` do tailwind.config.js
 * (font-sans/medium/semibold/bold/extrabold).
 */
export function useAppFonts(): boolean {
  const [loaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });
  return loaded;
}
