import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { EmptyState, ErrorState, LoadingState, Screen, Text } from '@/components';
import { ApiError, imageUrl } from '@/services/api';
import { useSession } from '@/features/account/useSession';
import { addMissingToWishlist } from '@/features/wishlist/add-to-wishlist';
import {
  getSetCards,
  getSetCompletion,
  type GridCard,
  type SetCardsPage,
  type SetCompletion,
} from '@/features/catalog/api';

/**
 * Grade da edição (T057/T058, FR-068/FR-071/FR-072): carrega progressivamente e sobrepõe a
 * posse do usuário sobre a grade **pública e cacheada** — as duas fontes são compostas aqui, e
 * não no servidor, para que o payload do catálogo sirva a todo mundo (visitante incluso).
 *
 * Sem sessão, a completude nem é pedida: o visitante não vê indicador de posse (FR-072).
 */
export default function SetGridScreen() {
  const router = useRouter();
  const { session, loading: sessionLoading } = useSession();
  const { setId } = useLocalSearchParams<{ setId: string }>();

  const [pages, setPages] = useState<SetCardsPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [completion, setCompletion] = useState<SetCompletion | null>(null);
  const [onlyMissing, setOnlyMissing] = useState(false);

  const loadPage = useCallback(
    async (page: number) => {
      const data = await getSetCards(setId, page);
      setPages((prev) => (page === 1 ? [data] : [...prev, data]));
    },
    [setId],
  );

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    loadPage(1)
      .catch((e) => active && setError(e instanceof Error ? e : new Error(String(e))))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [loadPage]);

  // Posse: só com sessão. Falha aqui não derruba a grade — a navegação pública é o essencial.
  useEffect(() => {
    if (sessionLoading || !session) {
      setCompletion(null);
      return;
    }
    let active = true;
    getSetCompletion(setId)
      .then((d) => active && setCompletion(d))
      .catch(() => active && setCompletion(null));
    return () => {
      active = false;
    };
  }, [setId, session, sessionLoading]);

  const last = pages.at(-1);
  const cards = pages.flatMap((p) => p.cards);
  const ownedQty = new Map(completion?.owned_cards.map((o) => [o.card_id, o.quantity]) ?? []);
  const visible = onlyMissing ? cards.filter((card) => !ownedQty.has(card.id)) : cards;

  const loadMore = () => {
    if (!last?.has_more || loadingMore || loading) return;
    setLoadingMore(true);
    loadPage(last.page + 1)
      .catch(() => undefined)
      .finally(() => setLoadingMore(false));
  };

  if (loading && pages.length === 0) return <LoadingState label="Carregando edição…" />;
  if (error) {
    return (
      <ErrorState
        message={error instanceof ApiError ? error.message : 'Não foi possível carregar a edição.'}
        onRetry={() => loadPage(1).catch(() => undefined)}
      />
    );
  }

  return (
    <Screen padded={false}>
      <Stack.Screen options={{ headerShown: true, title: last?.set.name ?? 'Edição' }} />
      <FlatList
        data={visible}
        key={onlyMissing ? 'missing' : 'all'}
        keyExtractor={(card) => card.id}
        numColumns={3}
        columnWrapperStyle={{ gap: 10 }}
        contentContainerStyle={{ padding: 16, gap: 12 }}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        ListHeaderComponent={
          completion ? (
            <CompletionHeader
              completion={completion}
              onlyMissing={onlyMissing}
              onToggle={() => setOnlyMissing((v) => !v)}
            />
          ) : null
        }
        ListEmptyComponent={
          onlyMissing ? (
            <EmptyState title="Edição completa!" hint="Você já tem todas as cartas carregadas." />
          ) : (
            <EmptyState title="Sem cartas" hint="Esta edição ainda não foi sincronizada." />
          )
        }
        ListFooterComponent={
          loadingMore ? <ActivityIndicator color="#6366f1" className="py-4" /> : null
        }
        renderItem={({ item }) => (
          <GridTile
            card={item}
            quantity={ownedQty.get(item.id) ?? null}
            showOwnership={completion != null}
            onPress={() => router.push({ pathname: '/explore/card', params: { cardId: item.id } })}
          />
        )}
      />
    </Screen>
  );
}

/** Completude navegável da edição (FR-072): possuídas vs. faltantes, com filtro. */
function CompletionHeader({
  completion,
  onlyMissing,
  onToggle,
}: {
  completion: SetCompletion;
  onlyMissing: boolean;
  onToggle: () => void;
}) {
  const missing = completion.missing_card_ids.length;
  return (
    <View className="mb-1 gap-2 rounded-lg border border-ink-200 bg-white p-3 dark:border-ink-800 dark:bg-ink-900">
      <View className="flex-row items-center justify-between">
        <Text weight="bold" className="text-base">
          {completion.owned} de {completion.total} · {completion.pct}%
        </Text>
        <Pressable accessibilityRole="button" onPress={onToggle}>
          <Text weight="bold" tone="brand" className="text-sm">
            {onlyMissing ? 'Ver todas' : `Ver faltantes (${missing})`}
          </Text>
        </Pressable>
      </View>
      <View className="h-1.5 overflow-hidden rounded-full bg-ink-200 dark:bg-ink-800">
        <View
          className="h-full rounded-full bg-brand-600"
          style={{ width: `${completion.pct}%` }}
        />
      </View>
      {/* Atalho em lote das faltantes (FR-072) — dependia dos endpoints da US9. */}
      {missing > 0 ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => void addMissingToWishlist(completion.missing_card_ids)}
          className="items-center rounded-sm border border-brand-500 py-2.5 active:opacity-70"
        >
          <Text weight="bold" tone="brand" className="text-sm">
            Adicionar {missing} faltante{missing === 1 ? '' : 's'} à wishlist
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function GridTile({
  card,
  quantity,
  showOwnership,
  onPress,
}: {
  card: GridCard;
  quantity: number | null;
  showOwnership: boolean;
  onPress: () => void;
}) {
  const owned = quantity != null;
  return (
    <Pressable onPress={onPress} className="flex-1 gap-1" style={{ maxWidth: '33%' }}>
      <View className="relative">
        <Image
          source={{ uri: imageUrl(card.image_small_url) }}
          className={`aspect-[0.72] w-full rounded-md bg-ink-100 dark:bg-ink-800 ${
            showOwnership && !owned ? 'opacity-30' : ''
          }`}
        />
        {showOwnership && owned ? (
          <View className="absolute right-1 top-1 min-w-[20px] items-center rounded-full bg-success px-1.5 py-0.5">
            <Text tone="inverse" weight="extrabold" className="text-2xs">
              {quantity}
            </Text>
          </View>
        ) : null}
      </View>
      <Text tone="muted" numberOfLines={1} className="text-center text-2xs">
        Nº {card.number}
      </Text>
    </Pressable>
  );
}
