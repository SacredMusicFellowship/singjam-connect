import { View, Text, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function SignInPrompt({ message }: { message: string }) {
  const router = useRouter();

  return (
    <View className="flex-1 items-center justify-center px-8 bg-white">
      <View className="w-14 h-14 rounded-full bg-amber-50 items-center justify-center mb-4">
        <Ionicons name="lock-closed-outline" size={24} color="#d97706" />
      </View>
      <Text className="text-zinc-900 font-semibold text-base text-center mb-1">{message}</Text>
      <Text className="text-zinc-400 text-sm text-center mb-5">
        Sign in or create an account to continue.
      </Text>
      <TouchableOpacity
        className="bg-amber-500 rounded-full px-6 py-3"
        onPress={() => router.push('/(auth)/sign-in' as any)}
      >
        <Text className="text-white font-semibold">Sign in</Text>
      </TouchableOpacity>
    </View>
  );
}
