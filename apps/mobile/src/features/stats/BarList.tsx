import { View } from 'react-native';
import { Text } from '@/components';

export interface BarRow {
  key: string;
  label: string;
  /** Valor numérico que dimensiona a barra (ex.: centavos ou %). */
  amount: number;
  /** Texto à direita (valor formatado). */
  trailing: string;
  /** Legenda secundária opcional sob o rótulo. */
  hint?: string;
}

/**
 * Lista de barras horizontais sem dependência de gráfico (distribuição FR-018 e completude
 * FR-020). Cada barra é normalizada pelo maior valor da lista.
 *
 * `accent` (cor concreta) e a largura ficam em `style`: são valores calculados em runtime, fora do
 * alcance das classes estáticas do NativeWind.
 */
export function BarList({ rows, accent = '#4f46e5' }: { rows: BarRow[]; accent?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.amount));
  return (
    <View className="gap-2.5">
      {rows.map((row) => (
        <View key={row.key} className="gap-1">
          <View className="flex-row items-baseline justify-between gap-2">
            <Text weight="semibold" numberOfLines={1} className="flex-1 text-sm">
              {row.label}
            </Text>
            <Text weight="semibold" tone="muted" className="text-sm">
              {row.trailing}
            </Text>
          </View>
          <View className="h-2 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
            <View
              className="h-2 rounded-full"
              style={{
                backgroundColor: accent,
                width: `${Math.max(3, (row.amount / max) * 100)}%`,
              }}
            />
          </View>
          {row.hint ? (
            <Text tone="muted" className="text-2xs">
              {row.hint}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}
