import { Text, TouchableOpacity } from 'react-native';

// The key you play a song in, as on web's MyKeySelect: the same thin-outline
// white pill as the controls beside it (not Lead's amber), one width whatever
// the key. The caller opens KeyPicker on press.
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
      className={`flex-row items-center justify-center rounded-full border border-zinc-200 bg-white ${size === 'md' ? 'px-3 py-1.5' : 'px-2.5 py-1'}`}
      style={{ minWidth: size === 'md' ? 92 : 78 }}
      accessibilityLabel="My key"
    >
      {value ? (
        <Text className={`${text} text-zinc-600`}>
          My key <Text className="font-semibold text-zinc-900">{value}</Text>
        </Text>
      ) : (
        <Text className={`${text} text-zinc-600`}>+ My key</Text>
      )}
    </TouchableOpacity>
  );
}
