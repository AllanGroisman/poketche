import { Pressable, View, type PressableProps, type ViewProps } from 'react-native';

/**
 * Superfície de cartão do design system (bg + borda + raio + padding), sensível a tema.
 * Substitui os `<View>` com `borderWidth/borderRadius/backgroundColor: c.card` redefinidos por tela.
 * Vira pressionável quando recebe `onPress`.
 */
const base = 'bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-lg';

const padding = { none: '', sm: 'p-3', md: 'p-4', lg: 'p-5' } as const;

export function Card({
  pad = 'md',
  className = '',
  onPress,
  ...props
}: (ViewProps & PressableProps) & {
  pad?: keyof typeof padding;
  className?: string;
}) {
  const cls = `${base} ${padding[pad]} ${className}`;
  if (onPress) {
    return <Pressable onPress={onPress} className={`${cls} active:opacity-80`} {...props} />;
  }
  return <View className={cls} {...(props as ViewProps)} />;
}
