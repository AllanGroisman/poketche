import { Alert } from 'react-native';
import { removeWishlistItem, type WishlistMatch } from './api';

/**
 * Pergunta de remoção ao registrar na coleção uma carta que está em wishlist (T065, FR-052).
 *
 * Vale "por qualquer método": o POST da coleção, o `confirm` do scanner (US5) e a compra no
 * marketplace (US6) devolvem o mesmo `wishlist_matches[]`, e todos chamam esta função — por isso
 * ela vive no feature, e não dentro de uma tela.
 *
 * Quando o usuário ligou a auto-remoção, a API já removeu (`removed: true`) e aqui só se avisa:
 * perguntar de novo seria ignorar a preferência que ele configurou.
 */
export function promptWishlistRemoval(
  matches: WishlistMatch[],
  autoRemoved: boolean,
  onDone?: () => void,
): void {
  if (matches.length === 0) return;

  const names = matches.map((m) => m.wishlist_name).join(', ');

  if (autoRemoved) {
    Alert.alert('Removida da wishlist', `A carta saiu automaticamente de: ${names}.`, [
      { text: 'OK', onPress: () => onDone?.() },
    ]);
    return;
  }

  Alert.alert(
    'Carta em wishlist',
    `Esta carta está em: ${names}. Deseja removê-la agora que você a possui?`,
    [
      { text: 'Manter', style: 'cancel', onPress: () => onDone?.() },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: () => {
          // Falha ao remover não desfaz o registro na coleção, que já aconteceu: a wishlist é
          // acessória. O usuário pode remover manualmente na tela da lista.
          Promise.all(matches.map((m) => removeWishlistItem(m.wishlist_id, m.item_id)))
            .catch(() => Alert.alert('Não foi possível remover da wishlist. Tente pela lista.'))
            .finally(() => onDone?.());
        },
      },
    ],
  );
}
