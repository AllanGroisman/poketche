import { View } from 'react-native';
import { Text, type TextTone } from './Text';

/**
 * Selo compacto (raridade, fonte de preço, "na coleção", tendência). Fundo suave por tom.
 * Substitui os badges com hex hardcoded (`buttonText`, `chipText`, etc.) espalhados nas telas.
 */
export type BadgeTone = 'neutral' | 'brand' | 'danger' | 'success' | 'warning';

const box: Record<BadgeTone, string> = {
  neutral: 'bg-ink-100 dark:bg-ink-800',
  brand: 'bg-brand-100 dark:bg-brand-950',
  danger: 'bg-danger-soft dark:bg-danger-softDark',
  success: 'bg-success-soft dark:bg-success-softDark',
  warning: 'bg-warning-soft dark:bg-warning-softDark',
};

const text: Record<BadgeTone, TextTone> = {
  neutral: 'muted',
  brand: 'brand',
  danger: 'danger',
  success: 'success',
  warning: 'default',
};

export function Badge({
  label,
  tone = 'neutral',
  className = '',
}: {
  label: string;
  tone?: BadgeTone;
  className?: string;
}) {
  return (
    <View className={`self-start rounded-full px-2 py-0.5 ${box[tone]} ${className}`}>
      <Text weight="semibold" tone={text[tone]} className="text-2xs">
        {label}
      </Text>
    </View>
  );
}
