import { Alert } from 'react-native';
import { ApiError } from '@/services/api';
import { addWishlistItem, addWishlistItemsBatch, createWishlist, getWishlists } from './api';

/**
 * Ações rápidas "adicionar à wishlist" do explorador de catálogo (T058 — FR-071 avulsa, FR-072
 * em lote). Ficaram pendentes na US10 esperando estes endpoints.
 *
 * Escolha da lista via `Alert`: com poucas wishlists é um toque a menos que abrir uma tela, e
 * evita um modal só para isso. Sem nenhuma lista, cria a primeira e segue direto — o usuário
 * pediu "adicionar", não "gerenciar listas".
 */

const DEFAULT_LIST_NAME = 'Minha wishlist';

/** Resolve a lista destino e executa `run`. Chamador já garantiu a sessão (auth-guard). */
async function withTargetList(
  title: string,
  run: (wishlistId: string) => Promise<string>,
): Promise<void> {
  try {
    const lists = await getWishlists();

    if (lists.length === 0) {
      const created = await createWishlist(DEFAULT_LIST_NAME);
      Alert.alert(await run(created.id));
      return;
    }
    if (lists.length === 1 && lists[0]) {
      Alert.alert(await run(lists[0].id));
      return;
    }

    Alert.alert(title, 'Escolha a wishlist:', [
      ...lists.slice(0, 3).map((l) => ({
        text: l.name,
        onPress: () => {
          run(l.id)
            .then((msg) => Alert.alert(msg))
            .catch((err) => Alert.alert(describe(err)));
        },
      })),
      { text: 'Cancelar', style: 'cancel' as const },
    ]);
  } catch (err) {
    Alert.alert(describe(err));
  }
}

function describe(err: unknown): string {
  if (err instanceof ApiError && err.code === 'conflict') return 'Essa carta já está na wishlist.';
  return err instanceof Error ? err.message : 'Não foi possível adicionar à wishlist.';
}

/** Ação rápida do detalhe da carta (FR-071). */
export function addCardToWishlist(cardId: string, cardName: string): Promise<void> {
  return withTargetList('Adicionar à wishlist', async (wishlistId) => {
    await addWishlistItem(wishlistId, cardId);
    return `${cardName} adicionada à wishlist.`;
  });
}

/** Atalho em lote das faltantes da edição (FR-072). */
export function addMissingToWishlist(cardIds: string[]): Promise<void> {
  return withTargetList('Adicionar faltantes', async (wishlistId) => {
    const res = await addWishlistItemsBatch(wishlistId, cardIds);
    return res.ignored > 0
      ? `${res.added} carta(s) adicionada(s); ${res.ignored} já estavam na lista.`
      : `${res.added} carta(s) adicionada(s) à wishlist.`;
  });
}
