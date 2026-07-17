import { FlatList, Image, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import type { Session } from '@supabase/supabase-js';
import { AsyncBoundary, EmptyState, Screen, Text, Button } from '@/components';
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
            contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 24 }}
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
              <View className="flex-row items-center gap-3 rounded-md border border-ink-200 bg-white p-2.5 dark:border-ink-800 dark:bg-ink-900">
                <Image
                  source={{ uri: imageUrl(item.card.image_small_url) }}
                  className="h-14 w-10 rounded bg-ink-100 dark:bg-ink-800"
                />
                <View className="min-w-0 flex-1">
                  <Text weight="semibold" numberOfLines={1}>
                    {item.card.name}
                  </Text>
                  <Text tone="muted" numberOfLines={1} className="text-xs">
                    {item.card.set.name} · Nº {item.card.number}
                  </Text>
                  <Text tone="muted" numberOfLines={1} className="text-xs">
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
  const { stats, summary } = data;
  return (
    <View className="gap-1.5 pb-2">
      <Text weight="extrabold" className="text-2xl">
        Coleção de {data.owner.display_name}
      </Text>
      <Text tone="muted" className="text-sm">
        {stats.distinct_cards} {stats.distinct_cards === 1 ? 'carta' : 'cartas'} · {stats.sets}{' '}
        {stats.sets === 1 ? 'edição' : 'edições'}
        {stats.total_cards != null ? ` · ${stats.total_cards} no total` : ''}
      </Text>

      {summary ? (
        <View className="mt-2 gap-1 rounded-lg bg-brand-600 p-4">
          <Text tone="inverse" weight="medium" className="text-xs uppercase opacity-80">
            Valor estimado
          </Text>
          <Text tone="inverse" weight="extrabold" className="text-3xl">
            {formatBRL(summary.total_cents)}
          </Text>
          {summary.unpriced_items > 0 ? (
            <Text tone="inverse" className="text-xs opacity-80">
              {summary.unpriced_items}{' '}
              {summary.unpriced_items === 1 ? 'carta sem cotação' : 'cartas sem cotação'} fora do
              total
            </Text>
          ) : null}
        </View>
      ) : null}

      {/* Ação restrita (FR-026a/SC-013): sem sessão, conduz ao cadastro e volta à coleção. */}
      {session ? null : (
        <Button
          title="Criar minha coleção"
          variant="outline"
          className="mt-3"
          onPress={() => requireSession(null, '/collection')}
        />
      )}
    </View>
  );
}
