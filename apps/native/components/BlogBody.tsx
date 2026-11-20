import { Image, Linking, Text, View } from 'react-native';
import { parseBlogMarkdown, type BlogInline } from '@singjam/core';

const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL ?? 'https://singjam.org';

function Inline({ nodes }: { nodes: BlogInline[] }) {
  return (
    <>
      {nodes.map((n, i) => {
        switch (n.type) {
          case 'text':
            return n.text;
          case 'strong':
            return <Text key={i} className="font-semibold text-slate-900"><Inline nodes={n.children} /></Text>;
          case 'em':
            return <Text key={i} className="italic"><Inline nodes={n.children} /></Text>;
          case 'code':
            return <Text key={i} className="bg-slate-100 font-mono text-[15px] text-slate-800">{n.text}</Text>;
          case 'link':
            return (
              <Text
                key={i}
                className="text-amber-700 underline"
                onPress={() => Linking.openURL(n.href.startsWith('/') ? `${WEB_URL}${n.href}` : n.href)}
              >
                <Inline nodes={n.children} />
              </Text>
            );
        }
      })}
    </>
  );
}

// Native counterpart of web's components/BlogBody.tsx; both draw the blocks
// parsed by parseBlogMarkdown in packages/core.
export default function BlogBody({ markdown }: { markdown: string }) {
  const blocks = parseBlogMarkdown(markdown);
  const body = 'text-[17px] leading-7 text-slate-700';
  return (
    <View className="gap-5">
      {blocks.map((b, i) => {
        switch (b.type) {
          case 'heading':
            return (
              <Text key={i} accessibilityRole="header" className={b.level === 3 ? 'pt-1 text-lg font-semibold text-slate-900' : 'pt-3 text-xl font-semibold text-slate-900'}>
                <Inline nodes={b.children} />
              </Text>
            );
          case 'paragraph':
            return <Text key={i} className={body}><Inline nodes={b.children} /></Text>;
          case 'list':
            return (
              <View key={i} className="gap-1.5">
                {b.items.map((item, j) => (
                  <View key={j} className="flex-row pr-2">
                    {b.ordered ? (
                      <Text className={`${body} w-6`}>{j + 1}.</Text>
                    ) : (
                      <View className="w-6 pt-3"><View className="h-1.5 w-1.5 rounded-full bg-amber-500" /></View>
                    )}
                    <Text className={`${body} flex-1`}><Inline nodes={item} /></Text>
                  </View>
                ))}
              </View>
            );
          case 'quote':
            return (
              <View key={i} className="border-l-4 border-amber-400 pl-4">
                <Text className={`${body} italic text-slate-600`}><Inline nodes={b.children} /></Text>
              </View>
            );
          case 'code':
            return (
              <View key={i} className="rounded-lg bg-slate-900 p-4">
                <Text className="font-mono text-sm text-slate-100">{b.text}</Text>
              </View>
            );
          case 'image':
            return (
              <Image
                key={i}
                source={{ uri: b.src }}
                accessibilityLabel={b.alt}
                resizeMode="contain"
                className="w-full rounded-lg border border-slate-200 bg-white"
                style={{ aspectRatio: 16 / 9 }}
              />
            );
          case 'rule':
            return <View key={i} className="h-px bg-slate-200" />;
        }
      })}
    </View>
  );
}
