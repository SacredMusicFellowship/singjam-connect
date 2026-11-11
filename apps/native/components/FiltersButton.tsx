import { Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// The "Filters" button above every filterable song list, with the active-filter count (web's FiltersButton).
export default function FiltersButton({ count, onPress }: { count: number; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      className={`h-7 flex-row items-center gap-1.5 rounded-full border px-3 ${count > 0 ? 'border-amber-400 bg-amber-50' : 'border-zinc-200 bg-white'}`}
    >
      <Ionicons name="filter" size={12} color={count > 0 ? '#b45309' : '#71717a'} />
      <Text className={`text-xs font-medium ${count > 0 ? 'text-amber-700' : 'text-zinc-500'}`}>
        Filters{count > 0 ? ` · ${count}` : ''}
      </Text>
    </TouchableOpacity>
  );
}
