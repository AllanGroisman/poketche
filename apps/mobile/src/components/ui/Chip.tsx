import { Pressable } from 'react-native';
import { Text } from './Text';

/**
 * Pílula selecionável (filtros do explorador, condição/idioma na revisão do scanner).
 * Estado ativo usa a marca; substitui os grupos de chip reimplementados em cada tela.
 */
export function Chip({
  label,
  selected = false,
  onPress,
  className = '',
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  className?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      className={`self-start rounded-full border px-3 py-1.5 active:opacity-70 ${
        selected
          ? 'border-brand-600 bg-brand-600'
          : 'border-ink-200 bg-transparent dark:border-ink-700'
      } ${className}`}
    >
      <Text weight="medium" tone={selected ? 'inverse' : 'muted'} className="text-sm">
        {label}
      </Text>
    </Pressable>
  );
}
