import { Pressable, View } from 'react-native';
import { Text } from '@/components';

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
  return (
    <View className="flex-row gap-1 rounded-md border border-ink-200 bg-white p-1 dark:border-ink-800 dark:bg-ink-900">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(opt.value)}
            className={`flex-1 items-center rounded-sm px-1 py-1.5 ${active ? 'bg-brand-600' : ''}`}
          >
            <Text
              weight="semibold"
              tone={active ? 'inverse' : 'muted'}
              numberOfLines={1}
              className="text-xs"
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
