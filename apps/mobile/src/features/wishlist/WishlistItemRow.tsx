import { Image, Pressable, View } from 'react-native';
import { Text, Badge } from '@/components';
import { formatBRL, formatBRLDelta, formatRelative } from '@/lib/format';
import { imageUrl } from '@/services/api';
import type { WishlistItem } from './api';

/**
 * Linha de carta na wishlist (T065, FR-049/FR-050/FR-051): preço atual, alvo, diferença e
 * indicador de "atingiu o alvo"; sinalização de "já na coleção" e de anúncios no alvo.
 *
 * A linha não decide nada: os indicadores vêm calculados da API (inclusive `target_reached`),
 * para que tela, notificação e job concordem sempre sobre o mesmo preço.
 */
export function WishlistItemRow({
  item,
  onPress,
  onEditTarget,
}: {
  item: WishlistItem;
  onPress?: () => void;
  onEditTarget?: () => void;
}) {
  const { price, target_price_cents: target, difference_cents: diff } = item;

  return (
    <Pressable
      onPress={onPress}
      className={`flex-row gap-3 rounded-md border bg-white p-2.5 active:opacity-80 dark:bg-ink-900 ${
        item.target_reached ? 'border-success' : 'border-ink-200 dark:border-ink-800'
      }`}
    >
      <Image
        source={{ uri: imageUrl(item.card.image_small_url) }}
        resizeMode="contain"
        className="h-[75px] w-[54px] rounded bg-ink-100 dark:bg-ink-800"
      />

      <View className="min-w-0 flex-1 gap-0.5">
        <Text weight="bold" numberOfLines={1}>
          {item.card.name}
        </Text>
        <Text tone="muted" numberOfLines={1} className="text-xs">
          {item.card.set.name} · {item.card.number}
        </Text>

        {price ? (
          <Text weight="semibold" className="mt-0.5">
            {formatBRL(price.price_cents)}
            {item.price_variant && item.price_variant !== 'normal' ? (
              <Text tone="muted"> · {VARIANT_LABEL[item.price_variant]}</Text>
            ) : null}
            <Text tone="muted" className="text-xs">
              {'  '}
              {formatRelative(price.fetched_at)}
            </Text>
          </Text>
        ) : (
          // Sem cotação: nem alvo nem alerta fazem sentido (FR-049).
          <Text weight="semibold" tone="muted" className="mt-0.5">
            Preço indisponível
          </Text>
        )}

        <Pressable onPress={onEditTarget} hitSlop={6}>
          {target != null ? (
            <Text tone="muted" className="mt-0.5 text-sm">
              Alvo {formatBRL(target)}
              {diff != null ? (
                <Text tone={diff <= 0 ? 'success' : 'muted'}>
                  {' · '}
                  {diff <= 0 ? `${formatBRLDelta(diff)} abaixo` : `faltam ${formatBRL(diff)}`}
                </Text>
              ) : null}
            </Text>
          ) : (
            <Text tone="brand" className="mt-0.5 text-sm">
              Definir preço-alvo
            </Text>
          )}
        </Pressable>

        <View className="mt-1.5 flex-row flex-wrap gap-1.5">
          {item.target_reached ? <Badge label="Atingiu o alvo" tone="success" /> : null}
          {item.in_collection.owned ? (
            <Badge label={`Já na coleção (${item.in_collection.quantity})`} tone="neutral" />
          ) : null}
          {item.listings_at_or_below_target.count > 0 ? (
            <Badge
              label={`${item.listings_at_or_below_target.count} anúncio(s) no alvo`}
              tone="brand"
            />
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const VARIANT_LABEL: Record<string, string> = {
  normal: 'normal',
  reverse_foil: 'reverse foil',
  holo: 'holo',
};
