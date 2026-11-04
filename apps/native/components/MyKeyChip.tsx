import { Text, TouchableOpacity } from 'react-native';

// The key you play a song in, as on web's MyKeySelect: amber once chosen,
// a plain hairline pill while empty. The caller opens KeyPicker on press.
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
      className={`flex-row items-center rounded-full ${size === 'md' ? 'px-3 py-1.5' : 'px-2.5 py-1'} ${
        value ? 'bg-amber-100' : 'border border-zinc-200 bg-white'
      }`}
      accessibilityLabel="My key"
    >
      {value ? (
        <>
          <Text className={`${text} text-amber-700 mr-1`}>My key</Text>
          <Text className={`${text} font-semibold text-amber-800`}>{value}</Text>
        </>
      ) : (
        <Text className={`${text} text-zinc-500`}>+ My key</Text>
      )}
    </TouchableOpacity>
  );
}
