import { View } from 'react-native';
import { useColorScheme } from 'nativewind';
import { Text } from '@/components';
import { formatBRL, formatDate } from '@/lib/format';
import type { PricePoint } from '@/features/collection/api';

/**
 * Gráfico do histórico de preço (FR-038) sem dependência externa: barras verticais
 * normalizadas entre menor/maior da série. Nunca renderiza vazio — quem chama só monta o
 * Sparkline quando há histórico suficiente (≥ 2 pontos); caso contrário mostra o aviso.
 *
 * Altura e cor das barras são calculadas em runtime → ficam em `style`, fora do NativeWind.
 */
export function Sparkline({ points, height = 120 }: { points: PricePoint[]; height?: number }) {
  const { colorScheme } = useColorScheme();
  const accent = colorScheme === 'dark' ? '#818cf8' : '#4f46e5'; // brand-400 / brand-600
  const idle = colorScheme === 'dark' ? '#4a4a52' : '#c9c9d0'; // ink-600 / ink-300
  const values = points.map((p) => p.price_cents);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1; // série achatada → todas as barras cheias

  return (
    <View className="gap-1.5">
      <View
        className="flex-row items-end justify-between gap-0.5 rounded-md border border-ink-200 px-1.5 py-1.5 dark:border-ink-800"
        style={{ height }}
      >
        {points.map((p, i) => {
          const ratio = (p.price_cents - min) / span;
          const barHeight = 6 + ratio * (height - 12); // piso p/ visibilidade
          const last = i === points.length - 1;
          return (
            <View
              key={`${p.t}-${i}`}
              className="min-w-[2px] flex-1 rounded-sm"
              style={{ height: barHeight, backgroundColor: last ? accent : idle }}
            />
          );
        })}
      </View>
      <View className="flex-row justify-between">
        <Text tone="muted" className="text-2xs">
          {formatDate(points[0]!.t)}
        </Text>
        <Text tone="muted" className="text-2xs">
          {formatBRL(min)} – {formatBRL(max)}
        </Text>
        <Text tone="muted" className="text-2xs">
          {formatDate(points[points.length - 1]!.t)}
        </Text>
      </View>
    </View>
  );
}
