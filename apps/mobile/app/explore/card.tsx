import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { AsyncBoundary, Screen, useThemeColors } from '@/components';
import { useAsync } from '@/lib/useAsync';
import { formatBRL, formatBRLDelta, formatRelative } from '@/lib/format';
import { imageUrl } from '@/services/api';
import { requireSession } from '@/services/auth-guard';
import { useSession } from '@/features/account/useSession';
import { SOURCE_LABELS } from '@/features/pricing/PriceTag';
import { CONDITION_LABELS, VARIANT_LABELS, getCollection } from '@/features/collection/api';
import { getCard, getCardListings, type CardDetail } from '@/features/catalog/api';
import { addCardToWishlist } from '@/features/wishlist/add-to-wishlist';

/**
 * Detalhe público da carta (T057/T058, FR-070/FR-071): imagem em alta, dados, preço de mercado
 * com fonte e data, e resumo do histórico — tudo sem conta (SC-020).
 *
 * Com sessão, a tela ganha posse e ações rápidas; sem sessão, a ação restrita conduz ao cadastro
 * e volta ao contexto (FR-026a/SC-013). O indicador de posse vem de uma chamada autenticada
 * separada: no payload público ele não existe, porque aquele payload é cacheado para todos.
 */
export default function CardDetailScreen() {
  const { cardId } = useLocalSearchParams<{ cardId: string }>();
  const state = useAsync(() => getCard(cardId), [cardId]);

  return (
    <Screen padded={false}>
      <Stack.Screen options={{ headerShown: true, title: 'Carta' }} />
      <AsyncBoundary state={state} loadingLabel="Carregando carta…">
        {(card) => <CardBody card={card} />}
      </AsyncBoundary>
    </Screen>
  );
}

function CardBody({ card }: { card: CardDetail }) {
  const c = useThemeColors();
  const router = useRouter();
  const { session } = useSession();

  // Posse (FR-071) só com sessão — o visitante nunca dispara esta chamada.
  const owned = useAsync(
    async () => (session ? getCollection('recent', card.id) : null),
    [session, card.id],
  );
  const listings = useAsync(() => getCardListings(card.id), [card.id]);

  const copies = owned.data?.items.reduce((sum, i) => sum + i.quantity, 0) ?? 0;
  const activeListings = listings.data?.listings.length ?? 0;

  const addToCollection = () => {
    if (!requireSession(session ?? null, '/explore/card')) return;
    router.push({
      pathname: '/collection/item',
      params: { cardId: card.id, cardName: card.name, cardImage: card.image_small_url },
    });
  };

  // Ação rápida da US10 que esperava a US9 (FR-071).
  const addToWishlist = () => {
    if (!requireSession(session ?? null, '/explore/card')) return;
    void addCardToWishlist(card.id, card.name);
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Image
        source={{ uri: imageUrl(card.image_large_url) }}
        style={styles.art}
        resizeMode="contain"
      />

      <Text style={[styles.name, { color: c.text }]}>{card.name}</Text>
      <Text style={[styles.meta, { color: c.muted }]}>
        {card.set.name} · Nº {card.number} · {card.rarity}
      </Text>
      <Text style={[styles.meta, { color: c.muted }]}>
        {card.supertype}
        {card.types.length ? ` · ${card.types.join(', ')}` : ''}
        {card.subtypes.length ? ` · ${card.subtypes.join(', ')}` : ''}
      </Text>

      <View style={[styles.box, { borderColor: c.border, backgroundColor: c.card }]}>
        <Text style={[styles.boxLabel, { color: c.muted }]}>Preço de mercado</Text>
        {card.market_price ? (
          <>
            <Text style={[styles.price, { color: c.text }]}>
              {formatBRL(card.market_price.price_cents)}
            </Text>
            <Text style={[styles.meta, { color: c.muted }]}>
              {SOURCE_LABELS[card.market_price.source]} ·{' '}
              {formatRelative(card.market_price.fetched_at)}
            </Text>
            {/* Sem contexto de item, o preço precisa dizer a que condição/variante se refere. */}
            <Text style={[styles.meta, { color: c.muted }]}>
              {VARIANT_LABELS[card.market_price.variant]}
              {card.market_price.condition
                ? ` · ${CONDITION_LABELS[card.market_price.condition]}`
                : ' · referência geral'}
            </Text>
          </>
        ) : (
          <Text style={[styles.unpriced, { color: c.muted }]}>Sem cotação disponível</Text>
        )}

        {card.change_30d ? (
          <Text
            style={[
              styles.change,
              { color: card.change_30d.change_cents >= 0 ? c.success : c.danger },
            ]}
          >
            {formatBRLDelta(card.change_30d.change_cents)} ({card.change_30d.change_pct}%) em 30d
          </Text>
        ) : (
          <Text style={[styles.meta, { color: c.muted }]}>
            {card.history_available ? 'Variação de 30d indisponível' : 'Histórico indisponível'}
          </Text>
        )}
      </View>

      {session ? (
        <View style={[styles.box, { borderColor: c.border, backgroundColor: c.card }]}>
          <Text style={[styles.boxLabel, { color: c.muted }]}>Na sua coleção</Text>
          <Text style={[styles.price, { color: c.text }]}>
            {copies > 0 ? `${copies} ${copies === 1 ? 'cópia' : 'cópias'}` : 'Nenhuma'}
          </Text>
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        onPress={addToCollection}
        style={[styles.cta, { backgroundColor: c.primary }]}
      >
        <Text style={styles.ctaText}>Adicionar à coleção</Text>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        onPress={addToWishlist}
        style={[styles.ctaSecondary, { borderColor: c.primary }]}
      >
        <Text style={[styles.ctaText, { color: c.primary }]}>Adicionar à wishlist</Text>
      </Pressable>

      <Text style={[styles.meta, { color: c.muted }]}>
        {activeListings > 0
          ? `${activeListings} ${activeListings === 1 ? 'anúncio ativo' : 'anúncios ativos'} no marketplace`
          : 'Nenhum anúncio ativo no marketplace'}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 6 },
  art: { width: '100%', height: 380, marginBottom: 8 },
  name: { fontSize: 24, fontWeight: '800' },
  meta: { fontSize: 13 },
  box: { marginTop: 10, padding: 12, borderRadius: 12, borderWidth: 1, gap: 2 },
  boxLabel: { fontSize: 12 },
  price: { fontSize: 26, fontWeight: '800' },
  unpriced: { fontSize: 15, fontStyle: 'italic' },
  change: { fontSize: 13, fontWeight: '700', marginTop: 4 },
  cta: {
    marginTop: 14,
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: 'center',
  },
  ctaSecondary: {
    marginTop: 8,
    paddingVertical: 13,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  ctaText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
