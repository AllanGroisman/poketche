import { Image, ScrollView, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { AsyncBoundary, EmptyState, Screen, Text, Card, Button } from '@/components';
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
  const router = useRouter();
  const { card, item } = details;
  if (!card) return <EmptyState title="Carta não encontrada" />;

  return (
    <ScrollView contentContainerStyle={{ gap: 18, paddingBottom: 40 }}>
      <View className="items-center gap-1.5">
        <Image
          source={{ uri: imageUrl(card.image_large_url) }}
          className="h-[251px] w-[180px] rounded-lg bg-ink-100 dark:bg-ink-800"
        />
        <Text weight="extrabold" className="text-center text-2xl">
          {card.name}
        </Text>
        <Text tone="muted" className="text-center text-sm">
          {card.set.name} · Nº {card.number} · {card.rarity}
        </Text>
        <Text tone="muted" className="text-center text-sm">
          {CONDITION_LABELS[item.condition]} · {item.language.toUpperCase()}
          {item.variant !== 'normal' ? ` · ${VARIANT_LABELS[item.variant]}` : ''} · ×{item.quantity}
        </Text>
      </View>

      <Card pad="md" className="flex-row justify-between">
        <View className="gap-0.5">
          <Text tone="muted" className="text-2xs uppercase tracking-wide">
            Preço atual
          </Text>
          <PriceTag price={details.current_price} />
        </View>
        <View className="items-end gap-0.5">
          <Text tone="muted" className="text-2xs uppercase tracking-wide">
            Valor da posição
          </Text>
          <Text weight="extrabold" className="text-lg">
            {details.position_value_cents == null ? '—' : formatBRL(details.position_value_cents)}
          </Text>
        </View>
      </Card>

      <PriceHistory details={details} />

      <Button
        title="Editar item"
        variant="outline"
        fullWidth
        onPress={() => router.push({ pathname: '/collection/item', params: { itemId } })}
      />
    </ScrollView>
  );
}
