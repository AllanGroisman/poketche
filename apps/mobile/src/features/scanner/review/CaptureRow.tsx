import { useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components';
import { imageUrl } from '@/services/api';
import {
  CONDITION_LABELS,
  LANGUAGE_LABELS,
  VARIANT_LABELS,
  type Condition,
  type Language,
  type Variant,
} from '@/features/collection/api';
import { deleteCapture, patchCapture, type PatchCaptureInput, type ScanCapture } from '../api';
import { Chips } from './Chips';

const CONDITION_OPTIONS = (Object.keys(CONDITION_LABELS) as Condition[]).map((v) => ({
  value: v,
  label: CONDITION_LABELS[v],
}));
const LANGUAGE_OPTIONS = (Object.keys(LANGUAGE_LABELS) as Language[]).map((v) => ({
  value: v,
  label: LANGUAGE_LABELS[v],
}));
const VARIANT_OPTIONS = (Object.keys(VARIANT_LABELS) as Variant[]).map((v) => ({
  value: v,
  label: VARIANT_LABELS[v],
}));

/**
 * Uma captura na revisão (T072, FR-056): resolve "a revisar" escolhendo um candidato, ajusta
 * condição/idioma/variante/quantidade e remove. Cada mudança persiste na hora e recarrega a lista
 * — a sessão é rascunho no servidor, então o estado de verdade é o dele.
 */
export function CaptureRow({
  sessionId,
  capture,
  onChanged,
}: {
  sessionId: string;
  capture: ScanCapture;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function patch(body: PatchCaptureInput) {
    if (busy) return;
    setBusy(true);
    try {
      await patchCapture(sessionId, capture.id, body);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (busy) return;
    setBusy(true);
    try {
      await deleteCapture(sessionId, capture.id);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  const needsReview = capture.status === 'needs_review';
  const needsCondition = capture.condition == null;

  return (
    <View
      className={`gap-2.5 rounded-lg border bg-white p-3 dark:bg-ink-900 ${
        needsReview ? 'border-danger' : 'border-ink-200 dark:border-ink-800'
      }`}
    >
      <View className="flex-row items-start gap-3">
        {capture.card ? (
          <Image
            source={{ uri: imageUrl(capture.card.image_small_url) }}
            className="h-[72px] w-[52px] rounded-md bg-ink-100 dark:bg-ink-800"
          />
        ) : (
          <View className="h-[72px] w-[52px] items-center justify-center rounded-md border border-ink-200 dark:border-ink-700">
            <Ionicons name="help" size={22} color="#9a9aa2" />
          </View>
        )}
        <View className="min-w-0 flex-1">
          <Text weight="bold">{capture.card ? capture.card.name : 'A revisar'}</Text>
          {capture.card ? (
            <Text tone="muted" className="mt-0.5 text-xs">
              {capture.card.set.name} · Nº {capture.card.number}
              {capture.card.rarity ? ` · ${capture.card.rarity}` : ''}
            </Text>
          ) : (
            <Text tone="muted" className="mt-0.5 text-xs">
              O OCR não bateu certeza — escolha um candidato ou remova.
            </Text>
          )}
          {!capture.language_detected && capture.card ? (
            <Text tone="muted" className="mt-0.5 text-xs">
              Idioma incerto — confira abaixo.
            </Text>
          ) : null}
        </View>
        <Pressable onPress={() => void remove()} hitSlop={8}>
          <Text weight="bold" tone="danger" className="text-sm">
            Remover
          </Text>
        </Pressable>
      </View>

      {/* Candidatos para resolver o "a revisar" (FR-056). */}
      {needsReview && capture.candidates.length > 0 ? (
        <View className="gap-1.5">
          <Label>Candidatos</Label>
          <View className="gap-1.5">
            {capture.candidates.map((cand) => (
              <Pressable
                key={cand.card_id}
                onPress={() => void patch({ card_id: cand.card_id })}
                className="rounded-sm border border-ink-200 p-2 active:opacity-70 dark:border-ink-700"
              >
                <Text weight="semibold" className="text-xs">
                  {cand.name}
                </Text>
                <Text tone="muted" className="text-2xs">
                  {cand.set_name} · Nº {cand.number}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {/* Atributos editáveis (só fazem sentido com carta resolvida). */}
      {capture.card ? (
        <>
          <View className="gap-1.5">
            <Label danger={needsCondition}>
              Condição{needsCondition ? ' — defina para incluir na coleção' : ''}
            </Label>
            <Chips
              options={CONDITION_OPTIONS}
              value={capture.condition}
              onChange={(v) => void patch({ condition: v })}
            />
          </View>
          <View className="gap-1.5">
            <Label>Idioma</Label>
            <Chips
              options={LANGUAGE_OPTIONS}
              value={capture.language}
              onChange={(v) => void patch({ language: v })}
            />
          </View>
          <View className="gap-1.5">
            <Label>Variante</Label>
            <Chips
              options={VARIANT_OPTIONS}
              value={capture.variant}
              onChange={(v) => void patch({ variant: v })}
            />
          </View>
          <View className="flex-row items-center justify-between">
            <Label>Quantidade</Label>
            <View className="flex-row items-center gap-3.5">
              <StepButton
                icon="remove"
                onPress={() =>
                  capture.quantity > 1 && void patch({ quantity: capture.quantity - 1 })
                }
              />
              <Text weight="bold" className="min-w-[24px] text-center">
                {capture.quantity}
              </Text>
              <StepButton
                icon="add"
                onPress={() => void patch({ quantity: capture.quantity + 1 })}
              />
            </View>
          </View>
        </>
      ) : null}
    </View>
  );
}

function Label({ children, danger }: { children: React.ReactNode; danger?: boolean }) {
  return (
    <Text weight="semibold" tone={danger ? 'danger' : 'muted'} className="text-xs">
      {children}
    </Text>
  );
}

function StepButton({ icon, onPress }: { icon: 'add' | 'remove'; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="h-[34px] w-[34px] items-center justify-center rounded-full border border-ink-200 active:opacity-60 dark:border-ink-700"
    >
      <Ionicons name={icon} size={18} color="#9a9aa2" />
    </Pressable>
  );
}
