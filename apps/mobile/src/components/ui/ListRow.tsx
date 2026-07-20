import { Pressable, View } from 'react-native';
import { Text } from './Text';

/**
 * Linha de lista padrão (item da coleção, carta no explorador): imagem/ícone à esquerda, título +
 * subtítulo no meio, conteúdo à direita (preço, tendência, chevron). Unifica os vários "row"
 * redesenhados por tela num só layout.
 */
export function ListRow({
  leading,
  title,
  subtitle,
  trailing,
  onPress,
  className = '',
}: {
  leading?: React.ReactNode;
  title: string;
  subtitle?: string;
  trailing?: React.ReactNode;
  onPress?: () => void;
  className?: string;
}) {
  const body = (
    <>
      {leading ? <View>{leading}</View> : null}
      <View className="min-w-0 flex-1 gap-0.5">
        <Text weight="semibold" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text tone="muted" numberOfLines={1} className="text-sm">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing ? <View className="items-end">{trailing}</View> : null}
    </>
  );
  const cls = `flex-row items-center gap-3 rounded-md border border-ink-200 bg-white p-3 dark:border-ink-800 dark:bg-ink-900 ${className}`;
  if (onPress) {
    return (
      <Pressable onPress={onPress} className={`${cls} active:opacity-80`}>
        {body}
      </Pressable>
    );
  }
  return <View className={cls}>{body}</View>;
}
