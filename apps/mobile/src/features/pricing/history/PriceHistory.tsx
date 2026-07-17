import { View } from 'react-native';
import { Text, Card, type TextTone } from '@/components';
import { formatBRL, formatBRLDelta, formatPercentDelta } from '@/lib/format';
import type { GainLoss, ItemDetails, PeriodVariation } from '@/features/collection/api';
import { Sparkline } from './Sparkline';

/**
 * Bloco de histórico e estatísticas da tela de detalhe (US8, FR-038/040/042). Com < 2
 * snapshots exibe "histórico indisponível" (nunca um gráfico vazio) e as variações de
 * períodos sem dados aparecem como "—" (sem interpolar).
 */
export function PriceHistory({ details }: { details: ItemDetails }) {
  return (
    <View className="gap-4">
      <View className="gap-2">
        <Section>Histórico de preço</Section>
        {details.history_available ? (
          <Sparkline points={details.history} />
        ) : (
          <View className="rounded-md border border-dashed border-ink-300 p-5 dark:border-ink-700">
            <Text tone="muted" className="text-center text-sm">
              Histórico indisponível — ainda não há dados suficientes para o gráfico.
            </Text>
          </View>
        )}
      </View>

      <View className="gap-2">
        <Section>Variação</Section>
        <View className="flex-row gap-2">
          <VariationCell label="7 dias" v={details.variations['7d']} />
          <VariationCell label="30 dias" v={details.variations['30d']} />
          <VariationCell label="90 dias" v={details.variations['90d']} />
        </View>
      </View>

      {details.high_low ? (
        <View className="flex-row gap-2">
          <Range label="Menor" cents={details.high_low.low_cents} />
          <Range label="Maior" cents={details.high_low.high_cents} />
        </View>
      ) : null}

      <GainLossRow gainLoss={details.gain_loss} />
    </View>
  );
}

function Section({ children }: { children: string }) {
  return (
    <Text weight="semibold" tone="muted" className="text-xs uppercase tracking-wide">
      {children}
    </Text>
  );
}

/** Tom do delta: verde sobe, vermelho cai, neutro estável ou sem dado. */
function deltaTone(cents: number | null): TextTone {
  if (cents == null || cents === 0) return 'muted';
  return cents > 0 ? 'success' : 'danger';
}

function VariationCell({ label, v }: { label: string; v: PeriodVariation | null }) {
  return (
    <View className="flex-1 gap-0.5 rounded-md border border-ink-200 p-2.5 dark:border-ink-800">
      <Text tone="muted" className="text-2xs">
        {label}
      </Text>
      <Text weight="bold" tone={deltaTone(v?.change_cents ?? null)}>
        {v == null ? '—' : formatPercentDelta(v.change_pct / 100)}
      </Text>
      {v != null ? (
        <Text tone="muted" className="text-2xs">
          {formatBRLDelta(v.change_cents)}
        </Text>
      ) : null}
    </View>
  );
}

function Range({ label, cents }: { label: string; cents: number }) {
  return (
    <View className="flex-1 gap-0.5 rounded-md border border-ink-200 p-2.5 dark:border-ink-800">
      <Text tone="muted" className="text-2xs">
        {label} registrado
      </Text>
      <Text weight="bold">{formatBRL(cents)}</Text>
    </View>
  );
}

/** Ganho/perda: vs. preço de compra ou, sem ele, desde a adição do item (FR-040). */
function GainLossRow({ gainLoss }: { gainLoss: GainLoss | null }) {
  if (!gainLoss) return null;
  const title = gainLoss.basis === 'acquisition' ? 'Ganho/perda vs. compra' : 'Desde a adição';
  return (
    <Card pad="md" className="gap-1">
      <Section>{title}</Section>
      <Text weight="extrabold" tone={deltaTone(gainLoss.change_cents)} className="text-xl">
        {formatBRLDelta(gainLoss.change_cents)} · {formatPercentDelta(gainLoss.change_pct / 100)}
      </Text>
      <Text tone="muted" className="text-2xs">
        {formatBRL(gainLoss.from_cents)} → {formatBRL(gainLoss.to_cents)}
      </Text>
    </Card>
  );
}
