import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { EmptyState, ErrorState, LoadingState, Screen, useThemeColors } from '@/components';
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
  const c = useThemeColors();
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
        columnWrapperStyle={styles.column}
        contentContainerStyle={styles.list}
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
          loadingMore ? <ActivityIndicator color={c.primary} style={styles.footer} /> : null
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
  const c = useThemeColors();
  const missing = completion.missing_card_ids.length;
  return (
    <View style={[styles.completion, { borderColor: c.border, backgroundColor: c.card }]}>
      <View style={styles.completionRow}>
        <Text style={[styles.completionText, { color: c.text }]}>
          {completion.owned} de {completion.total} · {completion.pct}%
        </Text>
        <Pressable accessibilityRole="button" onPress={onToggle}>
          <Text style={{ color: c.primary, fontWeight: '700', fontSize: 13 }}>
            {onlyMissing ? 'Ver todas' : `Ver faltantes (${missing})`}
          </Text>
        </Pressable>
      </View>
      <View style={[styles.bar, { backgroundColor: c.border }]}>
        <View
          style={[styles.barFill, { backgroundColor: c.primary, width: `${completion.pct}%` }]}
        />
      </View>
      {/* Atalho em lote das faltantes (FR-072) — dependia dos endpoints da US9. */}
      {missing > 0 ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => void addMissingToWishlist(completion.missing_card_ids)}
          style={[styles.batch, { borderColor: c.primary }]}
        >
          <Text style={{ color: c.primary, fontWeight: '700', fontSize: 13 }}>
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
  const c = useThemeColors();
  const owned = quantity != null;
  return (
    <Pressable onPress={onPress} style={styles.tile}>
      <Image
        source={{ uri: imageUrl(card.image_small_url) }}
        style={[styles.art, showOwnership && !owned ? styles.missingArt : null]}
      />
      {showOwnership && owned ? (
        <View style={[styles.badge, { backgroundColor: c.success }]}>
          <Text style={styles.badgeText}>{quantity}</Text>
        </View>
      ) : null}
      <Text style={[styles.number, { color: c.muted }]} numberOfLines={1}>
        Nº {card.number}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { padding: 12, gap: 10 },
  column: { gap: 10 },
  tile: { flex: 1 / 3, gap: 4 },
  art: { width: '100%', aspectRatio: 0.72, borderRadius: 6, backgroundColor: '#0002' },
  // Carta faltante fica esmaecida — a leitura de "o que falta" é visual, não textual.
  missingArt: { opacity: 0.28 },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 20,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 10,
    alignItems: 'center',
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  number: { fontSize: 11, textAlign: 'center' },
  completion: { padding: 12, borderRadius: 12, borderWidth: 1, gap: 8, marginBottom: 4 },
  batch: { paddingVertical: 9, borderRadius: 8, borderWidth: 1, alignItems: 'center' },
  completionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  completionText: { fontSize: 15, fontWeight: '700' },
  bar: { height: 6, borderRadius: 3, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 3 },
  footer: { paddingVertical: 16 },
});
