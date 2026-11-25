import { Alert, Image, Linking, TouchableOpacity } from 'react-native';

// A song's chord chart at the end of a row of song actions: the Ultimate Guitar
// icon in an outlined pill, as on mobile web's ChordsLink. One width on every
// row, so the buttons before it line up.
export default function ChordsChip({ url }: { url: string }) {
  return (
    <TouchableOpacity
      onPress={() => Linking.openURL(url).catch(() => Alert.alert('Could not open link'))}
      className="items-center justify-center rounded-full border border-zinc-200 bg-white px-2.5 py-1.5"
      accessibilityLabel="Chord chart"
    >
      <Image source={require('../assets/ultimate-guitar.png')} style={{ width: 20, height: 20 }} />
    </TouchableOpacity>
  );
}
