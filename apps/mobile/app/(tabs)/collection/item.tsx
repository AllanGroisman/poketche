import { type ReactNode, useState } from 'react';
import { Alert, Image, ScrollView, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { AsyncBoundary, EmptyState, Screen, Text, Input, Button, Chip } from '@/components';
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
    <View className="gap-4">
      <View className="items-center gap-2">
        {cardImage ? (
          <Image
            source={{ uri: imageUrl(cardImage) }}
            className="h-[134px] w-24 rounded-md bg-ink-100 dark:bg-ink-800"
          />
        ) : null}
        <Text weight="bold" className="text-center text-xl">
          {cardName}
        </Text>
      </View>

      <Field label="Condição">
        <ChipRow
          options={Object.keys(CONDITION_LABELS) as Condition[]}
          value={condition}
          onChange={setCondition}
          label={(k) => CONDITION_LABELS[k]}
        />
      </Field>
      <Field label="Idioma">
        <ChipRow
          options={['pt', 'en'] as Language[]}
          value={language}
          onChange={setLanguage}
          label={(k) => LANGUAGE_LABELS[k]}
        />
      </Field>
      <Field label="Variante">
        <ChipRow
          options={Object.keys(VARIANT_LABELS) as Variant[]}
          value={variant}
          onChange={setVariant}
          label={(k) => VARIANT_LABELS[k]}
        />
      </Field>
      <Input
        label="Quantidade"
        keyboardType="number-pad"
        value={quantity}
        onChangeText={setQuantity}
      />
      <Input
        label="Preço de aquisição (R$, opcional)"
        keyboardType="decimal-pad"
        placeholder="0,00"
        value={price}
        onChangeText={setPrice}
      />

      <Button
        title={initial ? 'Salvar' : 'Adicionar à coleção'}
        size="lg"
        fullWidth
        loading={busy}
        disabled={busy}
        onPress={submit}
        className="mt-2"
      />

      {onDelete ? (
        <Button title="Remover item" variant="outline" fullWidth disabled={busy} onPress={remove} />
      ) : null}
    </View>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View className="gap-2">
      <Text weight="semibold" tone="muted" className="text-sm">
        {label}
      </Text>
      {children}
    </View>
  );
}

function ChipRow<T extends string>({
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
  return (
    <View className="flex-row flex-wrap gap-2">
      {options.map((opt) => (
        <Chip key={opt} label={label(opt)} selected={opt === value} onPress={() => onChange(opt)} />
      ))}
    </View>
  );
}
