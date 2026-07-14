import { StyleSheet, Text, View } from 'react-native';
import { useThemeColors } from '@/components';
import { formatBRL, formatRelative } from '@/lib/format';
import type { CardPrice, PriceSource } from '@/features/collection/api';

/** Rótulo da fonte da cotação (FR-012) — deixa claro quando é referência internacional. */
export const SOURCE_LABELS: Record<PriceSource, string> = {
  liga_pokemon: 'Liga Pokémon',
  intl_usd_fx: 'Referência intl. (USD)',
};

/**
 * Exibe preço vigente + fonte + data (FR-012/FR-013). Sem cotação → indicação neutra, para
 * o usuário entender que o item fica fora do total (não é erro).
 */
export function PriceTag({ price }: { price: CardPrice | null }) {
  const c = useThemeColors();
  if (!price) {
    return <Text style={[styles.unpriced, { color: c.muted }]}>Sem cotação</Text>;
  }
  return (
    <View>
      <Text style={[styles.price, { color: c.text }]}>{formatBRL(price.price_cents)}</Text>
      <Text style={[styles.meta, { color: c.muted }]}>
        {SOURCE_LABELS[price.source]} · {formatRelative(price.fetched_at)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  price: { fontSize: 15, fontWeight: '700', textAlign: 'right' },
  meta: { fontSize: 11, textAlign: 'right' },
  unpriced: { fontSize: 12, fontStyle: 'italic', textAlign: 'right' },
});
