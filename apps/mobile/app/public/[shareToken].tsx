import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import type { Session } from '@supabase/supabase-js';
import { AsyncBoundary, EmptyState, Screen, useThemeColors } from '@/components';
import { useAsync } from '@/lib/useAsync';
import { formatBRL } from '@/lib/format';
import { imageUrl } from '@/services/api';
import { requireSession } from '@/services/auth-guard';
import { useSession } from '@/features/account/useSession';
import { PriceTag } from '@/features/pricing/PriceTag';
import { CONDITION_LABELS, VARIANT_LABELS } from '@/features/collection/api';
import { getPublicCollection, type PublicCollection } from '@/features/public/api';

/**
 * Coleção pública compartilhada, somente leitura (T051, FR-003b, SC-012). Abre por deep link
 * (`poketche://public/<token>`) sem sessão — o layout raiz não a intercepta.
 *
 * A tela não decide o que esconder: renderiza o que a API mandou. Campo nulo = não autorizado.
 * Link revogado/privado cai no 404 opaco da API → mensagem clara do ErrorState (FR-003c).
 */
export default function PublicCollectionScreen() {
  const c = useThemeColors();
  const { session } = useSession();
  const { shareToken } = useLocalSearchParams<{ shareToken: string }>();
  const state = useAsync(() => getPublicCollection(shareToken), [shareToken]);

  return (
    <Screen padded={false}>
      <Stack.Screen options={{ headerShown: true, title: 'Coleção compartilhada' }} />
      <AsyncBoundary state={state} loadingLabel="Abrindo coleção…">
        {(data) => (
          <FlatList
            data={data.items}
            keyExtractor={(item, i) => `${item.card.id}-${item.condition}-${item.variant}-${i}`}
            contentContainerStyle={styles.list}
            ListHeaderComponent={<Header data={data} session={session} />}
            ListEmptyComponent={
              data.visibility.show_cards ? (
                <EmptyState title="Coleção vazia" hint="Nenhuma carta registrada ainda." />
              ) : (
                <EmptyState
                  title="Cartas não exibidas"
                  hint="O dono optou por compartilhar apenas as estatísticas."
                />
              )
            }
            renderItem={({ item }) => (
              <View style={[styles.row, { borderColor: c.border }]}>
                <Image source={{ uri: imageUrl(item.card.image_small_url) }} style={styles.thumb} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, { color: c.text }]}>{item.card.name}</Text>
                  <Text style={[styles.meta, { color: c.muted }]}>
                    {item.card.set.name} · Nº {item.card.number}
                  </Text>
                  <Text style={[styles.meta, { color: c.muted }]}>
                    {CONDITION_LABELS[item.condition]} · {VARIANT_LABELS[item.variant]}
                    {item.quantity != null ? ` · ${item.quantity}×` : ''}
                  </Text>
                </View>
                {data.visibility.show_values ? <PriceTag price={item.price} /> : null}
              </View>
            )}
          />
        )}
      </AsyncBoundary>
    </Screen>
  );
}

function Header({
  data,
  session,
}: {
  data: PublicCollection;
  session: Session | null | undefined;
}) {
  const c = useThemeColors();
  const { stats, summary } = data;
  return (
    <View style={styles.header}>
      <Text style={[styles.owner, { color: c.text }]}>Coleção de {data.owner.display_name}</Text>
      <Text style={[styles.stats, { color: c.muted }]}>
        {stats.distinct_cards} {stats.distinct_cards === 1 ? 'carta' : 'cartas'} · {stats.sets}{' '}
        {stats.sets === 1 ? 'edição' : 'edições'}
        {stats.total_cards != null ? ` · ${stats.total_cards} no total` : ''}
      </Text>

      {summary ? (
        <View style={[styles.totalBox, { borderColor: c.border, backgroundColor: c.card }]}>
          <Text style={[styles.totalLabel, { color: c.muted }]}>Valor estimado</Text>
          <Text style={[styles.total, { color: c.text }]}>{formatBRL(summary.total_cents)}</Text>
          {summary.unpriced_items > 0 ? (
            <Text style={[styles.stats, { color: c.muted }]}>
              {summary.unpriced_items}{' '}
              {summary.unpriced_items === 1 ? 'carta sem cotação' : 'cartas sem cotação'} fora do
              total
            </Text>
          ) : null}
        </View>
      ) : null}

      {/* Ação restrita (FR-026a/SC-013): sem sessão, conduz ao cadastro e volta à coleção. */}
      {session ? null : (
        <Pressable
          accessibilityRole="button"
          onPress={() => requireSession(null, '/collection')}
          style={[styles.cta, { borderColor: c.primary }]}
        >
          <Text style={{ color: c.primary, fontWeight: '700' }}>Criar minha coleção</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { padding: 12, gap: 8 },
  header: { gap: 6, paddingBottom: 8 },
  owner: { fontSize: 22, fontWeight: '800' },
  stats: { fontSize: 13 },
  totalBox: { marginTop: 8, padding: 12, borderRadius: 12, borderWidth: 1, gap: 2 },
  totalLabel: { fontSize: 12 },
  total: { fontSize: 26, fontWeight: '800' },
  cta: {
    marginTop: 12,
    alignSelf: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
    borderWidth: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  thumb: { width: 40, height: 56, borderRadius: 4, backgroundColor: '#0002' },
  name: { fontSize: 16, fontWeight: '600' },
  meta: { fontSize: 12 },
});
