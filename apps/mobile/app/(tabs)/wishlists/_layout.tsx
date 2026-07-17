import { Stack } from 'expo-router';

/** Stack da aba Wishlist: listas (index) → detalhe empilham mantendo a tab bar. */
export default function WishlistsStack() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
