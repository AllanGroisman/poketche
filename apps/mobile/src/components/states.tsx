import { ActivityIndicator, View } from 'react-native';
import { Text } from './ui/Text';
import { Button } from './ui/Button';

/**
 * Estados padrão de tela — loading, erro (com retry) e vazio. Constituição VI: toda tela que carrega
 * dados cobre estes três casos. APIs preservadas; visual repaginado com o design system.
 */

export function LoadingState({ label = 'Carregando…' }: { label?: string }) {
  return (
    <View className="flex-1 items-center justify-center gap-2.5 p-6">
      <ActivityIndicator color="#6366f1" />
      <Text tone="muted" className="text-center text-sm">
        {label}
      </Text>
    </View>
  );
}

export function ErrorState({
  message = 'Algo deu errado.',
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <View className="flex-1 items-center justify-center gap-3 p-6">
      <Text weight="bold" className="text-lg">
        Ops
      </Text>
      <Text tone="muted" className="text-center text-sm">
        {message}
      </Text>
      {onRetry ? <Button title="Tentar de novo" variant="outline" onPress={onRetry} /> : null}
    </View>
  );
}

export function EmptyState({ title = 'Nada aqui ainda', hint }: { title?: string; hint?: string }) {
  return (
    <View className="flex-1 items-center justify-center gap-2 p-6">
      <Text weight="bold" className="text-lg">
        {title}
      </Text>
      {hint ? (
        <Text tone="muted" className="text-center text-sm">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}
