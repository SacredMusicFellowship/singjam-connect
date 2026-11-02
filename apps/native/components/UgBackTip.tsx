import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DISMISSED_KEY = 'sj-ug-back-tip-dismissed';

// Mirrors web's UgBackTip: the Ultimate Guitar app reopens the last chart
// unless you tap its own back arrow before leaving it.
export default function UgBackTip() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(DISMISSED_KEY)
      .then((v) => { if (!v) setShow(true); })
      .catch(() => setShow(true));
  }, []);

  if (!show) return null;

  function dismiss() {
    setShow(false);
    AsyncStorage.setItem(DISMISSED_KEY, '1').catch(() => {});
  }

  return (
    <View className="mx-4 mt-3 flex-row items-start rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5">
      <Text className="flex-1 text-xs text-zinc-600 mr-3">
        Using the Ultimate Guitar app? Tap the back arrow <Text className="italic">inside UG</Text> before you return here, or the next chart will open this song again.
      </Text>
      <TouchableOpacity onPress={dismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Text className="text-xs font-medium text-amber-600">Got it</Text>
      </TouchableOpacity>
    </View>
  );
}
