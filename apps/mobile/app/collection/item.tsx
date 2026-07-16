import { type ReactNode, useState } from 'react';
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { AsyncBoundary, EmptyState, Screen, useThemeColors } from '@/components';
import { useAsync } from '@/lib/useAsync';
import { imageUrl } from '@/services/api';
import {
  CONDITION_LABELS,
  LANGUAGE_LABELS,
  VARIANT_LABELS,
  addItem,
  deleteItem,
  getCollection,
  updateItem,
  type CollectionItem,
  type Condition,
  type Language,
  type Variant,
} from '@/features/collection/api';
import { promptWishlistRemoval } from '@/features/wishlist/removal-prompt';

export default function ItemScreen() {
  const params = useLocalSearchParams<{
    cardId?: string;
    cardName?: string;
    cardImage?: string;
    itemId?: string;
  }>();

  if (params.itemId) {
    return <EditItem itemId={params.itemId} />;
  }
  return (
    <FormShell title="Adicionar carta">
      <ItemForm
        cardName={params.cardName ?? 'Carta'}
        cardImage={params.cardImage}
        onSubmit={async (v) => {
          const res = await addItem({ card_id: params.cardId!, ...v });
          // Carta em wishlist: pergunta (ou avisa, se a auto-remoção estiver ligada) — FR-052.
          // O prompt sobe depois do `router.back()` do formulário, sobre a tela de origem.
          promptWishlistRemoval(res.wishlist_matches, res.wishlist_auto_removed);
          return res;
        }}
      />
    </FormShell>
  );
}

function EditItem({ itemId }: { itemId: string }) {
  const state = useAsync(getCollection, []);
  return (
    <FormShell title="Editar item">
      <AsyncBoundary state={state} loadingLabel="Carregando…">
        {({ items }) => {
          const item = items.find((i) => i.id === itemId);
          if (!item) return <EmptyState title="Item não encontrado" />;
          return (
            <ItemForm
              cardName={item.card.name}
              cardImage={item.card.image_small_url}
              initial={item}
              onSubmit={(v) => updateItem(itemId, v)}
              onDelete={() => deleteItem(itemId)}
            />
          );
        }}
      </AsyncBoundary>
    </FormShell>
  );
}

function FormShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Screen>
      <Stack.Screen options={{ headerShown: true, title }} />
      <ScrollView contentContainerStyle={{ gap: 16, paddingBottom: 40 }}>{children}</ScrollView>
    </Screen>
  );
}

interface FormValues {
  condition: Condition;
  language: Language;
  variant: Variant;
  quantity: number;
  acquisition_price_cents?: number | null;
}

function ItemForm({
  cardName,
  cardImage,
  initial,
  onSubmit,
  onDelete,
}: {
  cardName: string;
  cardImage?: string;
  initial?: CollectionItem;
  onSubmit: (v: FormValues) => Promise<unknown>;
  onDelete?: () => Promise<unknown>;
}) {
  const c = useThemeColors();
  const router = useRouter();
  const [condition, setCondition] = useState<Condition>(initial?.condition ?? 'near_mint');
  const [language, setLanguage] = useState<Language>(initial?.language ?? 'pt');
  const [variant, setVariant] = useState<Variant>(initial?.variant ?? 'normal');
  const [quantity, setQuantity] = useState(String(initial?.quantity ?? 1));
  const [price, setPrice] = useState(
    initial?.acquisition_price_cents != null
      ? (initial.acquisition_price_cents / 100).toString()
      : '',
  );
  const [busy, setBusy] = useState(false);

  async function submit() {
    const qty = parseInt(quantity, 10);
    if (!Number.isInteger(qty) || qty < 1)
      return Alert.alert('Quantidade inválida', 'Informe 1 ou mais.');
    let cents: number | null | undefined;
    if (price.trim() === '') {
      cents = initial ? null : undefined;
    } else {
      const reais = Number(price.replace(',', '.'));
      if (!(reais > 0))
        return Alert.alert('Preço inválido', 'O preço de aquisição deve ser maior que zero.');
      cents = Math.round(reais * 100);
    }
    setBusy(true);
    try {
      await onSubmit({
        condition,
        language,
        variant,
        quantity: qty,
        acquisition_price_cents: cents,
      });
      router.back();
    } catch (e) {
      Alert.alert('Erro', e instanceof Error ? e.message : 'Falha ao salvar.');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!onDelete) return;
    setBusy(true);
    try {
      await onDelete();
      router.back();
    } catch (e) {
      Alert.alert('Erro', e instanceof Error ? e.message : 'Falha ao remover.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: 16 }}>
      <View style={styles.header}>
        {cardImage ? <Image source={{ uri: imageUrl(cardImage) }} style={styles.thumb} /> : null}
        <Text style={[styles.cardName, { color: c.text }]}>{cardName}</Text>
      </View>

      <Field label="Condição">
        <Chips
          options={Object.keys(CONDITION_LABELS) as Condition[]}
          value={condition}
          onChange={setCondition}
          label={(k) => CONDITION_LABELS[k]}
        />
      </Field>
      <Field label="Idioma">
        <Chips
          options={['pt', 'en'] as Language[]}
          value={language}
          onChange={setLanguage}
          label={(k) => LANGUAGE_LABELS[k]}
        />
      </Field>
      <Field label="Variante">
        <Chips
          options={Object.keys(VARIANT_LABELS) as Variant[]}
          value={variant}
          onChange={setVariant}
          label={(k) => VARIANT_LABELS[k]}
        />
      </Field>
      <Field label="Quantidade">
        <TextInput
          keyboardType="number-pad"
          value={quantity}
          onChangeText={setQuantity}
          style={[styles.input, { color: c.text, borderColor: c.border, backgroundColor: c.card }]}
        />
      </Field>
      <Field label="Preço de aquisição (R$, opcional)">
        <TextInput
          keyboardType="decimal-pad"
          placeholder="0,00"
          placeholderTextColor={c.muted}
          value={price}
          onChangeText={setPrice}
          style={[styles.input, { color: c.text, borderColor: c.border, backgroundColor: c.card }]}
        />
      </Field>

      <Pressable
        disabled={busy}
        onPress={submit}
        style={[styles.save, { backgroundColor: c.primary, opacity: busy ? 0.6 : 1 }]}
      >
        <Text style={styles.saveText}>{initial ? 'Salvar' : 'Adicionar à coleção'}</Text>
      </Pressable>

      {onDelete ? (
        <Pressable
          disabled={busy}
          onPress={remove}
          style={[styles.delete, { borderColor: c.border }]}
        >
          <Text style={{ color: c.danger, fontWeight: '600' }}>Remover item</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  const c = useThemeColors();
  return (
    <View style={{ gap: 8 }}>
      <Text style={[styles.label, { color: c.muted }]}>{label}</Text>
      {children}
    </View>
  );
}

function Chips<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: T[];
  value: T;
  onChange: (v: T) => void;
  label: (v: T) => string;
}) {
  const c = useThemeColors();
  return (
    <View style={styles.chips}>
      {options.map((opt) => {
        const active = opt === value;
        return (
          <Pressable
            key={opt}
            onPress={() => onChange(opt)}
            style={[
              styles.chip,
              {
                borderColor: active ? c.primary : c.border,
                backgroundColor: active ? c.primary : 'transparent',
              },
            ]}
          >
            <Text style={{ color: active ? '#fff' : c.text, fontSize: 13 }}>{label(opt)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', gap: 8 },
  thumb: { width: 96, height: 134, borderRadius: 6, backgroundColor: '#0002' },
  cardName: { fontSize: 20, fontWeight: '700', textAlign: 'center' },
  label: { fontSize: 13, fontWeight: '600' },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 16 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 20, borderWidth: 1 },
  save: { marginTop: 8, padding: 15, borderRadius: 10, alignItems: 'center' },
  saveText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  delete: { padding: 13, borderRadius: 10, borderWidth: 1, alignItems: 'center' },
});
