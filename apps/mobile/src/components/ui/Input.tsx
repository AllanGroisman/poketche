import { TextInput, View, type TextInputProps } from 'react-native';
import { useColorScheme } from 'nativewind';
import { Text } from './Text';

/**
 * Campo de texto do design system, com rótulo e erro opcionais. Repõe os `<TextInput>` estilizados
 * à mão (search, AuthForm, edição de item). `placeholderTextColor` vem do esquema porque a variante
 * `placeholder:` do NativeWind não cobre RN.
 */
export function Input({
  label,
  error,
  className = '',
  ...props
}: TextInputProps & { label?: string; error?: string }) {
  const { colorScheme } = useColorScheme();
  const placeholderColor = colorScheme === 'dark' ? '#6b6b73' : '#9a9aa2';
  return (
    <View className="gap-1.5 self-stretch">
      {label ? (
        <Text weight="medium" tone="muted" className="text-sm">
          {label}
        </Text>
      ) : null}
      <TextInput
        placeholderTextColor={placeholderColor}
        className={`self-stretch rounded-md border px-4 py-3 text-base font-sans text-ink-900 dark:text-ink-50 ${
          error ? 'border-danger' : 'border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-900'
        } ${className}`}
        {...props}
      />
      {error ? (
        <Text tone="danger" className="text-sm">
          {error}
        </Text>
      ) : null}
    </View>
  );
}
