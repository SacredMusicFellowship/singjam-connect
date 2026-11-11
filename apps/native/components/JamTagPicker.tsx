import { useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Modal, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { JAM_TAG_TYPE_LABEL, loadJamTagOptions as loadOptions, type JamTagOption } from '@singjam/core';
import { supabase } from '@/lib/supabase';

export type { JamTagOption };

// The jam tag choices (core JAM_TAG_TYPES), the same one picker as web's jam form.
export function loadJamTagOptions(): Promise<JamTagOption[]> {
  return loadOptions(supabase);
}

export function jamTagSummary(options: JamTagOption[], selected: string[]): string {
  return selected.map(id => options.find(o => o.id === id)?.name).filter(Boolean).join(', ');
}

export default function JamTagPicker({ visible, options, selected, onToggle, onClose }: {
  visible: boolean;
  options: JamTagOption[];
  selected: string[];
  onToggle: (id: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    // Chosen tags first, then matches.
    const list = q ? options.filter(o => o.name.toLowerCase().includes(q)) : options;
    return [...list.filter(o => selected.includes(o.id)), ...list.filter(o => !selected.includes(o.id))];
  }, [options, selected, query]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View className="flex-1 bg-white">
        <View className="flex-row items-center px-4 pt-4 pb-3 border-b border-zinc-100">
          <View style={{ width: 48 }} />
          <Text className="flex-1 text-center font-semibold text-zinc-900">Tags</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text className="text-amber-600 font-medium">Done</Text>
          </TouchableOpacity>
        </View>
        <TextInput
          className="mx-4 my-3 border border-zinc-200 rounded-xl px-3 py-2 text-zinc-900"
          placeholder="Search genres, occasions, communities…"
          placeholderTextColor="#a1a1aa"
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
        <FlatList
          data={shown}
          keyExtractor={item => item.id}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            const checked = selected.includes(item.id);
            return (
              <TouchableOpacity
                onPress={() => onToggle(item.id)}
                className={`px-4 py-3 border-b border-zinc-100 flex-row items-center justify-between ${checked ? 'bg-amber-50' : ''}`}
              >
                <Text className={checked ? 'text-amber-800 font-semibold' : 'text-zinc-900'}>
                  {item.name}<Text className="text-zinc-400 font-normal">{`  ${JAM_TAG_TYPE_LABEL[item.type] ?? item.type}`}</Text>
                </Text>
                {checked && <Ionicons name="checkmark" size={16} color="#d97706" />}
              </TouchableOpacity>
            );
          }}
        />
      </View>
    </Modal>
  );
}
