import { Text } from '@/components';
import type { Trend } from '@/features/collection/api';

/**
 * Indicador de tendência (FR-041): ▲ valorização, ▼ desvalorização, — estável. `null` (sem
 * referência de 7d) não renderiza nada — não inventamos sinal.
 */
export function TrendBadge({ trend, size = 13 }: { trend: Trend | null; size?: number }) {
  if (!trend) return null;
  const map = {
    up: { glyph: '▲', tone: 'success' },
    down: { glyph: '▼', tone: 'danger' },
    flat: { glyph: '—', tone: 'muted' },
  } as const;
  const { glyph, tone } = map[trend];
  return (
    <Text weight="bold" tone={tone} style={{ fontSize: size }}>
      {glyph}
    </Text>
  );
}
