import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useThemeColors } from '@/components';

/** Controle segmentado simples para alternar eixo/tipo/período no dashboard (US4). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const c = useThemeColors();
  return (
    <View style={[styles.row, { borderColor: c.border, backgroundColor: c.card }]}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            accessibilityRole="button"
            onPress={() => onChange(opt.value)}
            style={[styles.seg, active && { backgroundColor: c.primary }]}
          >
            <Text style={[styles.label, { color: active ? '#fff' : c.muted }]} numberOfLines={1}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', padding: 3, borderRadius: 10, borderWidth: 1, gap: 3 },
  seg: { flex: 1, paddingVertical: 7, paddingHorizontal: 4, borderRadius: 8, alignItems: 'center' },
  label: { fontSize: 12, fontWeight: '600' },
});
