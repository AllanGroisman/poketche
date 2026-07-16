import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useThemeColors } from '@/components';
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
  const c = useThemeColors();
  const { price, target_price_cents: target, difference_cents: diff } = item;

  return (
    <Pressable
      onPress={onPress}
      style={[styles.row, { borderColor: item.target_reached ? c.success : c.border }]}
    >
      <Image source={{ uri: imageUrl(item.card.image_small_url) }} style={styles.thumb} />

      <View style={styles.body}>
        <Text style={[styles.name, { color: c.text }]} numberOfLines={1}>
          {item.card.name}
        </Text>
        <Text style={[styles.meta, { color: c.muted }]} numberOfLines={1}>
          {item.card.set.name} · {item.card.number}
        </Text>

        {price ? (
          <Text style={[styles.price, { color: c.text }]}>
            {formatBRL(price.price_cents)}
            {item.price_variant && item.price_variant !== 'normal' ? (
              <Text style={{ color: c.muted }}> · {VARIANT_LABEL[item.price_variant]}</Text>
            ) : null}
            <Text style={[styles.meta, { color: c.muted }]}>
              {'  '}
              {formatRelative(price.fetched_at)}
            </Text>
          </Text>
        ) : (
          // Sem cotação: nem alvo nem alerta fazem sentido (FR-049).
          <Text style={[styles.price, { color: c.muted }]}>Preço indisponível</Text>
        )}

        <Pressable onPress={onEditTarget} hitSlop={6}>
          {target != null ? (
            <Text style={[styles.target, { color: c.muted }]}>
              Alvo {formatBRL(target)}
              {diff != null ? (
                <Text style={{ color: diff <= 0 ? c.success : c.muted }}>
                  {' · '}
                  {diff <= 0 ? `${formatBRLDelta(diff)} abaixo` : `faltam ${formatBRL(diff)}`}
                </Text>
              ) : null}
            </Text>
          ) : (
            <Text style={[styles.target, { color: c.primary }]}>Definir preço-alvo</Text>
          )}
        </Pressable>

        <View style={styles.badges}>
          {item.target_reached ? <Badge label="Atingiu o alvo" bg={c.success} fg="#fff" /> : null}
          {item.in_collection.owned ? (
            <Badge
              label={`Já na coleção (${item.in_collection.quantity})`}
              bg={c.card}
              fg={c.muted}
              border={c.border}
            />
          ) : null}
          {item.listings_at_or_below_target.count > 0 ? (
            <Badge
              label={`${item.listings_at_or_below_target.count} anúncio(s) no alvo`}
              bg={c.card}
              fg={c.primary}
              border={c.primary}
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

function Badge({
  label,
  bg,
  fg,
  border,
}: {
  label: string;
  bg: string;
  fg: string;
  border?: string;
}) {
  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: bg, borderColor: border ?? bg, borderWidth: border ? 1 : 0 },
      ]}
    >
      <Text style={[styles.badgeText, { color: fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12, padding: 10, borderWidth: 1, borderRadius: 12 },
  thumb: { width: 54, height: 75, borderRadius: 4, resizeMode: 'contain' },
  body: { flex: 1, gap: 2 },
  name: { fontSize: 15, fontWeight: '700' },
  meta: { fontSize: 12 },
  price: { fontSize: 15, fontWeight: '600', marginTop: 2 },
  target: { fontSize: 13, marginTop: 2 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  badgeText: { fontSize: 11, fontWeight: '700' },
});
