import { Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// The "Hide my songs" checkbox in a song list's toolbar.
export default function HideMySongsToggle({ checked, onPress }: { checked: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} className="h-7 flex-row items-center gap-1.5 rounded-full border border-zinc-200 px-3">
      <Ionicons name={checked ? 'checkbox' : 'square-outline'} size={13} color={checked ? '#d97706' : '#d4d4d8'} />
      <Text className="text-xs font-medium text-zinc-500">Hide my songs</Text>
    </TouchableOpacity>
  );
}
