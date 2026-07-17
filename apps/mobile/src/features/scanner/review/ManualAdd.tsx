import { useEffect, useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text, Input, Button } from '@/components';
import { imageUrl } from '@/services/api';
import { searchCards, type CardResult } from '@/features/collection/api';
import { addManualCapture } from '../api';

/**
 * Adiciona manualmente uma carta não detectada (T072, FR-056). Busca no catálogo com debounce e,
 * ao escolher, cria a captura já identificada (o servidor marca `method: manual`). A condição fica
 * como o default `near_mint`, ajustável na linha depois.
 */
export function ManualAdd({ sessionId, onAdded }: { sessionId: string; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<CardResult[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResults([]);
      return;
    }
    let active = true;
    const t = setTimeout(() => {
      searchCards(term)
        .then((r) => active && setResults(r.results))
        .catch(() => active && setResults([]));
    }, 300);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [q]);

  async function pick(card: CardResult) {
    if (busy) return;
    setBusy(true);
    try {
      await addManualCapture(sessionId, { card_id: card.id, language: card.language });
      setQ('');
      setResults([]);
      setOpen(false);
      onAdded();
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={() => setOpen(true)}
        className="flex-row items-center justify-center gap-2 rounded-md border border-dashed border-ink-300 p-3.5 active:opacity-70 dark:border-ink-700"
      >
        <Ionicons name="add" size={18} color="#6366f1" />
        <Text weight="bold" tone="brand">
          Adicionar carta manualmente
        </Text>
      </Pressable>
    );
  }

  return (
    <View className="gap-2 rounded-md border border-ink-200 bg-white p-3 dark:border-ink-800 dark:bg-ink-900">
      <Input value={q} onChangeText={setQ} autoFocus placeholder="Buscar carta (nome)" />
      {results.map((card) => (
        <Pressable
          key={card.id}
          onPress={() => void pick(card)}
          className="flex-row items-center gap-2.5 rounded-sm border border-ink-200 p-2 active:opacity-70 dark:border-ink-700"
        >
          <Image
            source={{ uri: imageUrl(card.image_small_url) }}
            className="h-[50px] w-9 rounded bg-ink-100 dark:bg-ink-800"
          />
          <View className="min-w-0 flex-1">
            <Text weight="semibold" numberOfLines={1}>
              {card.name}
            </Text>
            <Text tone="muted" numberOfLines={1} className="text-xs">
              {card.set.name} · Nº {card.number}
            </Text>
          </View>
        </Pressable>
      ))}
      <Button title="Cancelar" variant="ghost" fullWidth onPress={() => setOpen(false)} />
    </View>
  );
}
