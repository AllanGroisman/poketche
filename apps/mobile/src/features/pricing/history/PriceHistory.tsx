import { StyleSheet, Text, View } from 'react-native';
import { useThemeColors } from '@/components';
import { formatBRL, formatBRLDelta, formatPercentDelta } from '@/lib/format';
import type { GainLoss, ItemDetails, PeriodVariation } from '@/features/collection/api';
import { Sparkline } from './Sparkline';

/**
 * Bloco de histórico e estatísticas da tela de detalhe (US8, FR-038/040/042). Com < 2
 * snapshots exibe "histórico indisponível" (nunca um gráfico vazio) e as variações de
 * períodos sem dados aparecem como "—" (sem interpolar).
 */
export function PriceHistory({ details }: { details: ItemDetails }) {
  const c = useThemeColors();
  return (
    <View style={{ gap: 16 }}>
      <View style={{ gap: 8 }}>
        <Text style={[styles.section, { color: c.muted }]}>Histórico de preço</Text>
        {details.history_available ? (
          <Sparkline points={details.history} />
        ) : (
          <View style={[styles.unavailable, { borderColor: c.border }]}>
            <Text style={{ color: c.muted, textAlign: 'center' }}>
              Histórico indisponível — ainda não há dados suficientes para o gráfico.
            </Text>
          </View>
        )}
      </View>

      <View style={{ gap: 8 }}>
        <Text style={[styles.section, { color: c.muted }]}>Variação</Text>
        <View style={styles.grid}>
          <VariationCell label="7 dias" v={details.variations['7d']} />
          <VariationCell label="30 dias" v={details.variations['30d']} />
          <VariationCell label="90 dias" v={details.variations['90d']} />
        </View>
      </View>

      {details.high_low ? (
        <View style={styles.rangeRow}>
          <Range label="Menor" cents={details.high_low.low_cents} />
          <Range label="Maior" cents={details.high_low.high_cents} />
        </View>
      ) : null}

      <GainLossRow gainLoss={details.gain_loss} />
    </View>
  );
}

function VariationCell({ label, v }: { label: string; v: PeriodVariation | null }) {
  const c = useThemeColors();
  const color =
    v == null ? c.muted : v.change_cents > 0 ? c.success : v.change_cents < 0 ? c.danger : c.muted;
  return (
    <View style={[styles.cell, { borderColor: c.border }]}>
      <Text style={[styles.cellLabel, { color: c.muted }]}>{label}</Text>
      <Text style={[styles.cellValue, { color }]}>
        {v == null ? '—' : formatPercentDelta(v.change_pct / 100)}
      </Text>
      {v != null ? (
        <Text style={[styles.cellDelta, { color: c.muted }]}>{formatBRLDelta(v.change_cents)}</Text>
      ) : null}
    </View>
  );
}

function Range({ label, cents }: { label: string; cents: number }) {
  const c = useThemeColors();
  return (
    <View style={[styles.cell, { borderColor: c.border }]}>
      <Text style={[styles.cellLabel, { color: c.muted }]}>{label} registrado</Text>
      <Text style={[styles.cellValue, { color: c.text }]}>{formatBRL(cents)}</Text>
    </View>
  );
}

/** Ganho/perda: vs. preço de compra ou, sem ele, desde a adição do item (FR-040). */
function GainLossRow({ gainLoss }: { gainLoss: GainLoss | null }) {
  const c = useThemeColors();
  if (!gainLoss) return null;
  const positive = gainLoss.change_cents > 0;
  const negative = gainLoss.change_cents < 0;
  const color = positive ? c.success : negative ? c.danger : c.muted;
  const title = gainLoss.basis === 'acquisition' ? 'Ganho/perda vs. compra' : 'Desde a adição';
  return (
    <View style={[styles.gainBox, { borderColor: c.border, backgroundColor: c.card }]}>
      <Text style={[styles.section, { color: c.muted }]}>{title}</Text>
      <Text style={[styles.gainValue, { color }]}>
        {formatBRLDelta(gainLoss.change_cents)} · {formatPercentDelta(gainLoss.change_pct / 100)}
      </Text>
      <Text style={[styles.cellDelta, { color: c.muted }]}>
        {formatBRL(gainLoss.from_cents)} → {formatBRL(gainLoss.to_cents)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
  unavailable: { padding: 20, borderWidth: 1, borderRadius: 10, borderStyle: 'dashed' },
  grid: { flexDirection: 'row', gap: 8 },
  rangeRow: { flexDirection: 'row', gap: 8 },
  cell: { flex: 1, padding: 10, borderWidth: 1, borderRadius: 10, gap: 2 },
  cellLabel: { fontSize: 11 },
  cellValue: { fontSize: 16, fontWeight: '700' },
  cellDelta: { fontSize: 11 },
  gainBox: { padding: 14, borderWidth: 1, borderRadius: 12, gap: 4 },
  gainValue: { fontSize: 20, fontWeight: '800' },
});
