import { Text } from 'react-native';
import { useThemeColors } from '@/components';
import type { Trend } from '@/features/collection/api';

/**
 * Indicador de tendência (FR-041): ▲ valorização, ▼ desvalorização, — estável. `null` (sem
 * referência de 7d) não renderiza nada — não inventamos sinal.
 */
export function TrendBadge({ trend, size = 13 }: { trend: Trend | null; size?: number }) {
  const c = useThemeColors();
  if (!trend) return null;
  const map = {
    up: { glyph: '▲', color: c.success },
    down: { glyph: '▼', color: c.danger },
    flat: { glyph: '—', color: c.muted },
  } as const;
  const { glyph, color } = map[trend];
  return <Text style={{ color, fontSize: size, fontWeight: '700' }}>{glyph}</Text>;
}
