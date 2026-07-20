import { View } from 'react-native';
import { Text, Card } from '@/components';
import { formatBRL } from '@/lib/format';
import type { ScanSummary } from '../api';

/** Resumo estatístico da sessão na revisão (T072, FR-057). */
export function ReviewSummary({ summary }: { summary: ScanSummary }) {
  return (
    <Card pad="md" className="gap-2.5">
      <View className="flex-row flex-wrap gap-4">
        <Stat label="Cartas" value={String(summary.total_cards)} />
        <Stat label="Valor estimado" value={formatBRL(summary.total_value_cents)} />
        <Stat label="Em wishlists" value={String(summary.in_wishlists)} />
        {summary.needs_review > 0 ? (
          <Stat label="A revisar" value={String(summary.needs_review)} warn />
        ) : null}
        {summary.unpriced_cards > 0 ? (
          <Stat label="Sem cotação" value={String(summary.unpriced_cards)} />
        ) : null}
      </View>
      {summary.most_valuable ? (
        <Text tone="muted" className="text-xs">
          Mais valiosa: {summary.most_valuable.card_name} ·{' '}
          {formatBRL(summary.most_valuable.value_cents)}
        </Text>
      ) : null}
    </Card>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <View className="min-w-[80px]">
      <Text weight="extrabold" tone={warn ? 'danger' : 'default'} className="text-xl">
        {value}
      </Text>
      <Text tone="muted" className="mt-0.5 text-xs">
        {label}
      </Text>
    </View>
  );
}
