import { View, Text, TouchableOpacity } from 'react-native';

export const COUNT_OR_AZ = [
  { value: 'count' as const, label: 'Most songs' },
  { value: 'az' as const, label: 'A–Z' },
];

// A small "Most songs / A–Z" switch for chip lists (the Browse hub, the filter sheet), as on web.
export default function OrderToggle<T extends string>({ value, onChange, options, className = '' }: {
  value: T;
  onChange: (v: T) => void;
  options: readonly { value: T; label: string }[];
  className?: string;
}) {
  return (
    <View className={`flex-row ${className}`} style={{ gap: 6 }}>
      {options.map((o) => (
        <TouchableOpacity
          key={o.value}
          onPress={() => onChange(o.value)}
          accessibilityState={{ selected: value === o.value }}
          className={`px-3 py-1 rounded-full border ${value === o.value ? 'border-amber-500 bg-amber-500' : 'border-slate-200 bg-white'}`}
        >
          <Text className={`text-sm ${value === o.value ? 'text-white' : 'text-slate-600'}`}>{o.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}
