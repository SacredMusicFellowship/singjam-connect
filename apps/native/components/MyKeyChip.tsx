import { Text, TouchableOpacity } from 'react-native';
import { KEY_STYLE, keyMode, keyWithMode } from '@singjam/core';

// The key you play a song in, as on web's MyKeySelect at phone width ("Key Am",
// "Key G"): an outlined pill in the key colour shared with the set list's key
// (violet once chosen, neutral while empty), wide enough for "+ My key" or "Key C#m" so it's
// one width on every song and the row's buttons line up. It shares the row's spare
// width with Role and + Set, as on mobile web. The caller opens KeyPicker on press.
export default function MyKeyChip({
  value,
  tonality,
  onPress,
  size = 'sm',
}: {
  value: string | null;
  tonality?: string | null;
  onPress: () => void;
  size?: 'sm' | 'md';
}) {
  const text = size === 'md' ? 'text-sm' : 'text-xs';
  return (
    <TouchableOpacity
      onPress={onPress}
      className={`flex-row items-center justify-center rounded-full ${value ? KEY_STYLE.chip : KEY_STYLE.emptyChip} ${size === 'md' ? 'px-3 py-1.5' : 'px-2.5 py-1'}`}
      style={{ minWidth: size === 'md' ? 84 : 74, flexGrow: 1 }}
      accessibilityLabel="My key"
    >
      {value ? (
        <Text className={`${text} ${KEY_STYLE.text}`}>
          Key <Text className="font-semibold">{keyWithMode(value, keyMode(tonality), 'short')}</Text>
        </Text>
      ) : (
        <Text className={`${text} ${KEY_STYLE.emptyText}`}>+ My key</Text>
      )}
    </TouchableOpacity>
  );
}
