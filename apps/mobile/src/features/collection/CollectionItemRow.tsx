import { Image, Pressable, View } from 'react-native';
import { Text } from '@/components';
import { imageUrl } from '@/services/api';
import { PriceTag } from '@/features/pricing/PriceTag';
import { TrendBadge } from '@/features/pricing/history/TrendBadge';
import { CONDITION_LABELS, VARIANT_LABELS, type CollectionItem } from './api';

/**
 * Linha de carta da coleção — apresentação única reusada pela listagem do inventário (US2) e
 * pelo recorte das coleções personalizadas (US3), para não haver drift visual entre as telas.
 */
export function CollectionItemRow({
  item,
  onPress,
  onLongPress,
}: {
  item: CollectionItem;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      className="flex-row items-center gap-3 rounded-md border border-ink-200 bg-white p-2.5 active:opacity-80 dark:border-ink-800 dark:bg-ink-900"
    >
      <Image
        source={{ uri: imageUrl(item.card.image_small_url) }}
        className="h-[61px] w-11 rounded bg-ink-100 dark:bg-ink-800"
      />
      <View className="min-w-0 flex-1 gap-0.5">
        <Text weight="semibold" numberOfLines={1}>
          {item.card.name}
        </Text>
        <Text tone="muted" numberOfLines={1} className="text-xs">
          {item.card.set.name} · Nº {item.card.number}
        </Text>
        <Text tone="muted" numberOfLines={1} className="text-xs">
          {subtitle(item)}
        </Text>
      </View>
      <View className="min-w-[96px] items-end gap-1">
        <View className="flex-row items-center gap-1">
          <TrendBadge trend={item.trend} />
          <Text weight="bold">×{item.quantity}</Text>
        </View>
        <PriceTag price={item.price} />
      </View>
    </Pressable>
  );
}

function subtitle(item: CollectionItem): string {
  const parts = [CONDITION_LABELS[item.condition], item.language.toUpperCase()];
  if (item.variant !== 'normal') parts.push(VARIANT_LABELS[item.variant]);
  return parts.join(' · ');
}
