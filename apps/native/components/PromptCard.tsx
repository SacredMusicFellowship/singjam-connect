import { View, Text, TouchableOpacity } from 'react-native';

// The two card shapes web uses for its signed-out and empty-repertoire states,
// in one place so the tabs can't drift from each other the way they had:
//   guest — roomier padding, an amber text link ("Sign in →")
//   nudge — a filled amber button ("Browse songs →")
type Props = {
  variant: 'guest' | 'nudge';
  title: string;
  body: string;
  // Omit both to render a message with no call to action — e.g. a private set,
  // where signing in wouldn't get the viewer any further.
  actionLabel?: string;
  onAction?: () => void;
};

export default function PromptCard({ variant, title, body, actionLabel, onAction }: Props) {
  const guest = variant === 'guest';
  const action = actionLabel && onAction ? { label: actionLabel, onPress: onAction } : null;

  return (
    <View className={`mx-4 rounded-2xl border border-zinc-200 bg-white items-center ${guest ? 'p-8' : 'p-6'}`}>
      <Text className="text-base font-semibold text-zinc-900 text-center">{title}</Text>
      <Text className={`text-sm text-zinc-500 text-center ${guest ? 'mt-2' : 'mt-1'}`}>{body}</Text>
      {!action ? null : guest ? (
        <TouchableOpacity onPress={action.onPress} className="mt-4">
          <Text className="text-sm font-medium text-amber-600">{action.label}</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity onPress={action.onPress} className="mt-4 rounded-full bg-amber-500 px-5 py-2.5">
          <Text className="text-sm font-semibold text-white">{action.label}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
