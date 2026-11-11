import { Text } from 'react-native';
import { songSubtitle } from '@singjam/core';

// The line under a song title in lists: "from <show>", else the artist.
// Renders inline, inside the caller's styled <Text>.
export default function SubtitleText({
  productions,
  artist,
  fallback = null,
}: {
  productions: readonly string[] | null | undefined;
  artist: string | null | undefined;
  fallback?: string | null;
}) {
  const s = songSubtitle(productions, artist);
  if (!s) return fallback ? <>{fallback}</> : null;
  return s.kind === 'production' ? <>from <Text className="italic">{s.text}</Text></> : <>{s.text}</>;
}
