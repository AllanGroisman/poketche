import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Link, Stack, useLocalSearchParams } from 'expo-router';
import { AsyncBoundary, EmptyState, Screen, useThemeColors } from '@/components';
import { useAsync } from '@/lib/useAsync';
import { imageUrl } from '@/services/api';
import { formatBRL } from '@/lib/format';
import { PriceTag } from '@/features/pricing/PriceTag';
import { PriceHistory } from '@/features/pricing/history/PriceHistory';
import {
  CONDITION_LABELS,
  VARIANT_LABELS,
  getItemDetails,
  type ItemDetails,
} from '@/features/collection/api';

/**
 * Tela de detalhes por carta da coleção (US8, FR-038–FR-042): preço atual, valor da posição,
 * gráfico do histórico, variações por período e ganho/perda. Editar leva ao formulário do item.
 */
export default function DetailsScreen() {
  const { itemId } = useLocalSearchParams<{ itemId: string }>();
  const state = useAsync(() => getItemDetails(itemId), [itemId]);

  return (
    <Screen>
      <Stack.Screen options={{ headerShown: true, title: 'Detalhes' }} />
      <AsyncBoundary state={state} loadingLabel="Carregando detalhes…">
        {(details) => <DetailsBody details={details} itemId={itemId} />}
      </AsyncBoundary>
    </Screen>
  );
}

function DetailsBody({ details, itemId }: { details: ItemDetails; itemId: string }) {
  const c = useThemeColors();
  const { card, item } = details;
  if (!card) return <EmptyState title="Carta não encontrada" />;

  return (
    <ScrollView contentContainerStyle={{ gap: 18, paddingBottom: 40 }}>
      <View style={styles.header}>
        <Image source={{ uri: imageUrl(card.image_large_url) }} style={styles.hero} />
        <Text style={[styles.name, { color: c.text }]}>{card.name}</Text>
        <Text style={[styles.meta, { color: c.muted }]}>
          {card.set.name} · Nº {card.number} · {card.rarity}
        </Text>
        <Text style={[styles.meta, { color: c.muted }]}>
          {CONDITION_LABELS[item.condition]} · {item.language.toUpperCase()}
          {item.variant !== 'normal' ? ` · ${VARIANT_LABELS[item.variant]}` : ''} · ×{item.quantity}
        </Text>
      </View>

      <View style={[styles.priceRow, { borderColor: c.border, backgroundColor: c.card }]}>
        <View style={{ gap: 2 }}>
          <Text style={[styles.priceLabel, { color: c.muted }]}>Preço atual</Text>
          <PriceTag price={details.current_price} />
        </View>
        <View style={{ alignItems: 'flex-end', gap: 2 }}>
          <Text style={[styles.priceLabel, { color: c.muted }]}>Valor da posição</Text>
          <Text style={[styles.position, { color: c.text }]}>
            {details.position_value_cents == null ? '—' : formatBRL(details.position_value_cents)}
          </Text>
        </View>
      </View>

      <PriceHistory details={details} />

      <Link href={{ pathname: '/collection/item', params: { itemId } }} asChild>
        <Pressable style={[styles.edit, { borderColor: c.border }]}>
          <Text style={{ color: c.primary, fontWeight: '700' }}>Editar item</Text>
        </Pressable>
      </Link>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', gap: 6 },
  hero: { width: 180, height: 251, borderRadius: 10, backgroundColor: '#0002' },
  name: { fontSize: 22, fontWeight: '800', textAlign: 'center' },
  meta: { fontSize: 13, textAlign: 'center' },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 14,
    borderWidth: 1,
    borderRadius: 12,
  },
  priceLabel: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4 },
  position: { fontSize: 18, fontWeight: '800' },
  edit: { padding: 13, borderRadius: 10, borderWidth: 1, alignItems: 'center' },
});
