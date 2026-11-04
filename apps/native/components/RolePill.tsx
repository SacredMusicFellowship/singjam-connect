import { Text, TouchableOpacity } from 'react-native';
import type { GestureResponderEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { confidenceLabel, confidenceStyle } from '@singjam/core';

// Your own Lead / Support / Learn for a song, coloured by level as on web's
// RoleSelect. The caller opens the picker (an options sheet) on press.
export default function RolePill({
  level,
  onPress,
  size = 'sm',
}: {
  level: string;
  onPress: (event: GestureResponderEvent) => void;
  size?: 'sm' | 'md';
}) {
  const style = confidenceStyle(level);
  return (
    <TouchableOpacity
      onPress={onPress}
      className={`flex-row items-center rounded-full border ${size === 'md' ? 'px-3 py-1.5' : 'px-2.5 py-1'} ${style.control}`}
      accessibilityLabel="Role"
    >
      <Text className={`${size === 'md' ? 'text-sm' : 'text-xs'} ${style.controlText}`}>{confidenceLabel(level)}</Text>
      <Ionicons name="chevron-down" size={size === 'md' ? 12 : 11} color={style.icon} style={{ marginLeft: 3 }} />
    </TouchableOpacity>
  );
}
