import { Image, ScrollView } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { AsyncBoundary, Screen, Text, Card, Button } from '@/components';
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
    <ScrollView contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: 32 }}>
      <Image
        source={{ uri: imageUrl(card.image_large_url) }}
        className="mb-2 h-[380px] w-full"
        resizeMode="contain"
      />

      <Text weight="extrabold" className="text-2xl">
        {card.name}
      </Text>
      <Text tone="muted" className="text-sm">
        {card.set.name} · Nº {card.number} · {card.rarity}
      </Text>
      <Text tone="muted" className="text-sm">
        {card.supertype}
        {card.types.length ? ` · ${card.types.join(', ')}` : ''}
        {card.subtypes.length ? ` · ${card.subtypes.join(', ')}` : ''}
      </Text>

      <Card pad="md" className="mt-2 gap-0.5">
        <Text tone="muted" className="text-xs">
          Preço de mercado
        </Text>
        {card.market_price ? (
          <>
            <Text weight="extrabold" className="text-2xl">
              {formatBRL(card.market_price.price_cents)}
            </Text>
            <Text tone="muted" className="text-sm">
              {SOURCE_LABELS[card.market_price.source]} ·{' '}
              {formatRelative(card.market_price.fetched_at)}
            </Text>
            {/* Sem contexto de item, o preço precisa dizer a que condição/variante se refere. */}
            <Text tone="muted" className="text-sm">
              {VARIANT_LABELS[card.market_price.variant]}
              {card.market_price.condition
                ? ` · ${CONDITION_LABELS[card.market_price.condition]}`
                : ' · referência geral'}
            </Text>
          </>
        ) : (
          <Text tone="muted" className="text-base italic">
            Sem cotação disponível
          </Text>
        )}

        {card.change_30d ? (
          <Text
            weight="bold"
            tone={card.change_30d.change_cents >= 0 ? 'success' : 'danger'}
            className="mt-1 text-sm"
          >
            {formatBRLDelta(card.change_30d.change_cents)} ({card.change_30d.change_pct}%) em 30d
          </Text>
        ) : (
          <Text tone="muted" className="text-sm">
            {card.history_available ? 'Variação de 30d indisponível' : 'Histórico indisponível'}
          </Text>
        )}
      </Card>

      {session ? (
        <Card pad="md" className="gap-0.5">
          <Text tone="muted" className="text-xs">
            Na sua coleção
          </Text>
          <Text weight="extrabold" className="text-2xl">
            {copies > 0 ? `${copies} ${copies === 1 ? 'cópia' : 'cópias'}` : 'Nenhuma'}
          </Text>
        </Card>
      ) : null}

      <Button
        title="Adicionar à coleção"
        size="lg"
        fullWidth
        onPress={addToCollection}
        className="mt-3"
      />
      <Button
        title="Adicionar à wishlist"
        variant="outline"
        size="lg"
        fullWidth
        onPress={addToWishlist}
      />

      <Text tone="muted" className="text-sm">
        {activeListings > 0
          ? `${activeListings} ${activeListings === 1 ? 'anúncio ativo' : 'anúncios ativos'} no marketplace`
          : 'Nenhum anúncio ativo no marketplace'}
      </Text>
    </ScrollView>
  );
}
