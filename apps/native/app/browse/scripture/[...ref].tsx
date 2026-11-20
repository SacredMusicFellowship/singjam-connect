import { useLocalSearchParams } from 'expo-router';
import { BrowseScreen } from '../[kind]/[slug]';

// A book or passage of scripture (/browse/scripture/psalms/90), as web's /scripture pages.
export default function ScriptureRoute() {
  const { ref } = useLocalSearchParams<{ ref: string | string[] }>();
  return <BrowseScreen kind="scripture" slug={([] as string[]).concat(ref ?? []).join('/')} />;
}
