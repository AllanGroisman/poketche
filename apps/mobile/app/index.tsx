import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { getHealth } from '@/services/api';

export default function Home() {
  const [status, setStatus] = useState<string>('conectando…');

  useEffect(() => {
    getHealth()
      .then((h) => setStatus(`API: ${h.status}`))
      .catch(() => setStatus('API indisponível'));
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>PokeTche</Text>
      <Text style={styles.subtitle}>Coleção e marketplace de Pokémon TCG</Text>
      <Text style={styles.status}>{status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
  title: { fontSize: 28, fontWeight: '700' },
  subtitle: { fontSize: 15, opacity: 0.7, textAlign: 'center' },
  status: { marginTop: 16, fontSize: 13, opacity: 0.5 },
});
