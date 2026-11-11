import { Text, TouchableOpacity } from 'react-native';
import { KEY_STYLE } from '@singjam/core';

// The key you play a song in, as on web's MyKeySelect: an outlined pill in the
// key colour shared with the set list's key (violet once chosen, neutral while
// empty), one width whatever the key. The caller opens KeyPicker on press.
export default function MyKeyChip({
  value,
  onPress,
  size = 'sm',
}: {
  value: string | null;
  onPress: () => void;
  size?: 'sm' | 'md';
}) {
  const text = size === 'md' ? 'text-sm' : 'text-xs';
  return (
    <TouchableOpacity
      onPress={onPress}
      className={`flex-row items-center justify-center rounded-full ${value ? KEY_STYLE.chip : KEY_STYLE.emptyChip} ${size === 'md' ? 'px-3 py-1.5' : 'px-2.5 py-1'}`}
      style={{ minWidth: size === 'md' ? 92 : 78 }}
      accessibilityLabel="My key"
    >
      {value ? (
        <Text className={`${text} ${KEY_STYLE.text}`}>
          My key <Text className="font-semibold">{value}</Text>
        </Text>
      ) : (
        <Text className={`${text} ${KEY_STYLE.emptyText}`}>+ My key</Text>
      )}
    </TouchableOpacity>
  );
}
