import { Alert } from 'react-native';
import { hasLeadVoice, LEAD_VOICE_UPGRADE } from '@singjam/core';
import { supabase } from '@/lib/supabase';

// Marking a song Lead when your profile doesn't say you sing lead asks first,
// as web's ConfidencePicker does: a yes adds lead vocals to the profile. Resolves
// true when the Lead can go ahead.
export function ensureLeadVoice(
  confidence: string,
  singingVoice: string | null,
  userId: string | null,
  onUpgraded: (voice: string) => void,
): Promise<boolean> {
  if (confidence !== 'lead' || hasLeadVoice(singingVoice) || !userId) return Promise.resolve(true);
  return new Promise((resolve) => {
    Alert.alert('Do you sing lead?', "We'll add lead vocals to your profile.", [
      { text: 'Not now', style: 'cancel', onPress: () => resolve(false) },
      {
        text: 'Yes',
        onPress: async () => {
          const { error } = await supabase.from('profiles').update({ singing_voice: LEAD_VOICE_UPGRADE }).eq('id', userId);
          if (error) {
            Alert.alert('Error', error.message);
            resolve(false);
            return;
          }
          onUpgraded(LEAD_VOICE_UPGRADE);
          resolve(true);
        },
      },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });
}
