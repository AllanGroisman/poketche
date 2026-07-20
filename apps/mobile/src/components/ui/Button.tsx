import { ActivityIndicator, Pressable, View, type PressableProps } from 'react-native';
import { Text, type TextTone } from './Text';

/**
 * Botão do design system. Repõe os `<Pressable>`+`<Text>` estilizados à mão em quase toda tela.
 * Variantes cobrem ação primária (marca), secundária, contorno, fantasma e perigo; tamanhos sm/md/lg.
 */
export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const container: Record<ButtonVariant, string> = {
  primary: 'bg-brand-600 active:bg-brand-700',
  secondary: 'bg-ink-100 dark:bg-ink-800 active:opacity-80',
  outline: 'border border-ink-300 dark:border-ink-700 active:opacity-70',
  ghost: 'active:opacity-60',
  danger: 'bg-danger active:opacity-80',
};

const labelTone: Record<ButtonVariant, TextTone> = {
  primary: 'inverse',
  secondary: 'default',
  outline: 'default',
  ghost: 'brand',
  danger: 'inverse',
};

const sizeBox: Record<ButtonSize, string> = {
  sm: 'px-3 py-2 rounded-sm',
  md: 'px-4 py-3 rounded-md',
  lg: 'px-5 py-4 rounded-md',
};

export function Button({
  title,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  leading,
  fullWidth = false,
  className = '',
  ...props
}: Omit<PressableProps, 'children'> & {
  title: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leading?: React.ReactNode;
  fullWidth?: boolean;
  className?: string;
}) {
  const isOff = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={isOff}
      className={`flex-row items-center justify-center gap-2 ${sizeBox[size]} ${container[variant]} ${
        fullWidth ? 'self-stretch' : 'self-start'
      } ${isOff ? 'opacity-50' : ''} ${className}`}
      {...props}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === 'primary' || variant === 'danger' ? '#fff' : undefined}
        />
      ) : (
        <>
          {leading ? <View>{leading}</View> : null}
          <Text
            weight="semibold"
            tone={labelTone[variant]}
            className={size === 'lg' ? 'text-lg' : ''}
          >
            {title}
          </Text>
        </>
      )}
    </Pressable>
  );
}
