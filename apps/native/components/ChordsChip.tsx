import { Ionicons } from '@expo/vector-icons';
import { Alert, Image, Linking, TouchableOpacity } from 'react-native';

// A song's chart at the end of a row of song actions: the Ultimate Guitar icon
// (or, for kind "score", a sheet-music icon) in an outlined pill, as on mobile
// web's ChordsLink. One width on every row, so the buttons before it line up.
export default function ChordsChip({ url, kind = 'chords' }: { url: string; kind?: 'chords' | 'score' }) {
  return (
    <TouchableOpacity
      onPress={() => Linking.openURL(url).catch(() => Alert.alert('Could not open link'))}
      className="items-center justify-center rounded-full border border-zinc-200 bg-white px-2.5 py-1.5"
      accessibilityLabel={kind === 'score' ? 'Score' : 'Chord chart'}
    >
      {kind === 'score'
        ? <Ionicons name="musical-notes-outline" size={20} color="#3f3f46" />
        : <Image source={require('../assets/ultimate-guitar.png')} style={{ width: 20, height: 20 }} />}
    </TouchableOpacity>
  );
}
