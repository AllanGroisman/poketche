import { StyleSheet, Text, View } from 'react-native';
import { useThemeColors } from '@/components';

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
 */
export function BarList({ rows, accent }: { rows: BarRow[]; accent?: string }) {
  const c = useThemeColors();
  const max = Math.max(1, ...rows.map((r) => r.amount));
  return (
    <View style={{ gap: 10 }}>
      {rows.map((row) => (
        <View key={row.key} style={{ gap: 4 }}>
          <View style={styles.head}>
            <Text style={[styles.label, { color: c.text }]} numberOfLines={1}>
              {row.label}
            </Text>
            <Text style={[styles.trailing, { color: c.muted }]}>{row.trailing}</Text>
          </View>
          <View style={[styles.track, { backgroundColor: c.card }]}>
            <View
              style={[
                styles.fill,
                {
                  backgroundColor: accent ?? c.primary,
                  width: `${Math.max(3, (row.amount / max) * 100)}%`,
                },
              ]}
            />
          </View>
          {row.hint ? <Text style={[styles.hint, { color: c.muted }]}>{row.hint}</Text> : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  label: { fontSize: 14, fontWeight: '600', flex: 1 },
  trailing: { fontSize: 13, fontWeight: '600' },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
  hint: { fontSize: 11 },
});
