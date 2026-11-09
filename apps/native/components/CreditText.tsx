import { Text } from 'react-native';
import { browsePath, type CardCredit } from '@singjam/core';

// Credits from @singjam/core (song cards, the line under a song's title) as
// nested Text, each linked part opening its browse page via `onOpen(webPath)`.
export default function CreditText({ credits, onOpen, separator = ', ', linkClassName }: {
  credits: CardCredit[];
  onOpen?: (webPath: string) => void;
  separator?: string;
  linkClassName?: string;
}) {
  return (
    <>
      {credits.map((c, i) => (
        <Text key={`${i}-${c.text}`}>
          {i > 0 ? separator : null}
          {c.lead ?? null}
          {c.link && onOpen ? (
            <Text className={linkClassName} onPress={() => onOpen(browsePath(c.link!.kind, c.link!.key, { traditional: c.link!.traditional }))}>{c.text}</Text>
          ) : c.text}
          {c.suffix ?? null}
        </Text>
      ))}
    </>
  );
}
