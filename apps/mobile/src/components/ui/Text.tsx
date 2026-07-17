import { forwardRef } from 'react';
import { Text as RNText, type TextProps } from 'react-native';

/**
 * Texto do design system. Centraliza fonte (Inter, por peso) e cor semântica (com dark: embutido),
 * substituindo o padrão antigo `style={[styles.x, { color: c.text }]}` repetido em cada tela.
 * `className` extra é concatenado (tamanho/margem/alinhamento ficam a cargo de quem chama).
 *
 * Encaminha a ref (`forwardRef`) porque o `<Link asChild>` do expo-router clona o filho passando uma
 * ref; sem isso o RN avisa "Function components cannot be given refs" e o toque no link não liga.
 */
export type TextWeight = 'regular' | 'medium' | 'semibold' | 'bold' | 'extrabold';
export type TextTone = 'default' | 'muted' | 'brand' | 'danger' | 'success' | 'inverse';

const weightClass: Record<TextWeight, string> = {
  regular: 'font-sans',
  medium: 'font-medium',
  semibold: 'font-semibold',
  bold: 'font-bold',
  extrabold: 'font-extrabold',
};

const toneClass: Record<TextTone, string> = {
  default: 'text-ink-900 dark:text-ink-50',
  muted: 'text-ink-500 dark:text-ink-400',
  brand: 'text-brand-600 dark:text-brand-400',
  danger: 'text-danger',
  success: 'text-success dark:text-success-dark',
  inverse: 'text-white',
};

export const Text = forwardRef<
  RNText,
  TextProps & { weight?: TextWeight; tone?: TextTone; className?: string }
>(function Text({ weight = 'regular', tone = 'default', className = '', ...props }, ref) {
  return (
    <RNText
      ref={ref}
      className={`${weightClass[weight]} ${toneClass[tone]} text-base ${className}`}
      {...props}
    />
  );
});
