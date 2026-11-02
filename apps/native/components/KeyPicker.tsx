import { Modal, View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MUSICAL_KEYS } from '@singjam/core';

export default function KeyPicker({
  visible,
  current,
  title = 'Select Key',
  onClose,
  onSelect,
}: {
  visible: boolean;
  current: string | null;
  title?: string;
  onClose: () => void;
  onSelect: (key: string | null) => void;
}) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="formSheet" onRequestClose={onClose}>
      <View className="flex-1 bg-white">
        <View className="flex-row items-center px-4 pt-4 pb-2 border-b border-zinc-100">
          <TouchableOpacity onPress={onClose}>
            <Text className="text-amber-600 font-medium">Cancel</Text>
          </TouchableOpacity>
          <Text className="flex-1 text-center font-semibold text-zinc-900">{title}</Text>
          <TouchableOpacity onPress={() => { onSelect(null); onClose(); }}>
            <Text className="text-zinc-400 font-medium">Clear</Text>
          </TouchableOpacity>
        </View>
        <ScrollView>
          {MUSICAL_KEYS.map((k) => (
            <TouchableOpacity
              key={k}
              onPress={() => { onSelect(k); onClose(); }}
              className={`px-6 py-4 border-b border-zinc-100 flex-row items-center justify-between ${current === k ? 'bg-amber-50' : ''}`}
            >
              <Text className={`text-base ${current === k ? 'text-amber-700 font-semibold' : 'text-zinc-900'}`}>{k}</Text>
              {current === k ? <Ionicons name="checkmark" size={18} color="#d97706" /> : null}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}
