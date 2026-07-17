import { View } from 'react-native';
import { Chip } from '@/components';

/**
 * Grupo de chips de escolha única (condição/idioma/variante da revisão). API preservada; o visual
 * vem do primitivo `Chip` do design system — antes era um chip próprio, redesenhado aqui.
 */
export function Chips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (v: T) => void;
}) {
  return (
    <View className="flex-row flex-wrap gap-1.5">
      {options.map((opt) => (
        <Chip
          key={opt.value}
          label={opt.label}
          selected={opt.value === value}
          onPress={() => onChange(opt.value)}
        />
      ))}
    </View>
  );
}
