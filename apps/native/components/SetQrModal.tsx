import { Image, Modal, Text, TouchableOpacity, View } from 'react-native';

// Shown on a phone held up at the jam, in web's QR look (SetInvitePanel): dark
// slate, the welcome, and the QR on a white card. The image comes from the web
// API, so the app needs no QR library.
export default function SetQrModal({ uri, onClose }: { uri: string | null; onClose: () => void }) {
  return (
    <Modal visible={!!uri} animationType="fade" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center bg-slate-900 px-6">
        <Text className="text-center text-3xl font-bold tracking-tight text-white">Welcome to SingJam!</Text>
        <Text className="mt-1 text-center text-xl font-bold tracking-tight text-amber-400">Scan to see today's songs</Text>
        <View className="mt-5 flex-row flex-wrap items-center justify-center rounded-2xl border border-white/15 bg-white/10 px-4 py-2.5">
          <Text className="text-sm font-medium text-slate-100">Know one? Tap </Text>
          <View className="mx-1 rounded-full bg-indigo-500 px-2.5 py-1">
            <Text className="text-xs font-semibold text-white">I know this song!</Text>
          </View>
          <Text className="text-sm font-medium text-slate-100"> so we can sing it together.</Text>
        </View>
        <View className="mt-7 rounded-3xl bg-white p-3">
          {uri ? (
            <Image source={{ uri }} style={{ width: 256, height: 256 }} accessibilityLabel="QR code invite link" />
          ) : null}
        </View>
        <TouchableOpacity onPress={onClose} className="mt-7 rounded-full bg-amber-500 px-8 py-3">
          <Text className="text-base font-semibold text-white">Done</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}
