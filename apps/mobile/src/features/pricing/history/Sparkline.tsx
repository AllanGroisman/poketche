import { StyleSheet, Text, View } from 'react-native';
import { useThemeColors } from '@/components';
import { formatBRL, formatDate } from '@/lib/format';
import type { PricePoint } from '@/features/collection/api';

/**
 * Gráfico do histórico de preço (FR-038) sem dependência externa: barras verticais
 * normalizadas entre menor/maior da série. Nunca renderiza vazio — quem chama só monta o
 * Sparkline quando há histórico suficiente (≥ 2 pontos); caso contrário mostra o aviso.
 */
export function Sparkline({ points, height = 120 }: { points: PricePoint[]; height?: number }) {
  const c = useThemeColors();
  const values = points.map((p) => p.price_cents);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1; // série achatada → todas as barras cheias

  return (
    <View style={{ gap: 6 }}>
      <View style={[styles.chart, { height, borderColor: c.border }]}>
        {points.map((p, i) => {
          const ratio = (p.price_cents - min) / span;
          const barHeight = 6 + ratio * (height - 12); // piso p/ visibilidade
          const last = i === points.length - 1;
          return (
            <View
              key={`${p.t}-${i}`}
              style={[
                styles.bar,
                { height: barHeight, backgroundColor: last ? c.primary : c.muted },
              ]}
            />
          );
        })}
      </View>
      <View style={styles.axis}>
        <Text style={[styles.axisLabel, { color: c.muted }]}>{formatDate(points[0]!.t)}</Text>
        <Text style={[styles.axisLabel, { color: c.muted }]}>
          {formatBRL(min)} – {formatBRL(max)}
        </Text>
        <Text style={[styles.axisLabel, { color: c.muted }]}>
          {formatDate(points[points.length - 1]!.t)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 6,
    borderWidth: 1,
    borderRadius: 10,
  },
  bar: { flex: 1, minWidth: 2, borderRadius: 2 },
  axis: { flexDirection: 'row', justifyContent: 'space-between' },
  axisLabel: { fontSize: 11 },
});
