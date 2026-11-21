import { useState } from 'react';
import { View, TouchableOpacity, Image } from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';

const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL ?? 'https://singjam.org';

// A WebView fed bare `html` loads as about:blank, and YouTube refuses to embed
// into a page with no resolvable origin ("Error 153"). So the document gets a
// baseUrl and the embed gets a matching `origin` param. That origin has to be
// our own site, the way a real embedding page would look — claiming to be
// youtube.com itself is same-origin with the player and gets refused too.
export default function YouTubePlayer({ videoId }: { videoId: string }) {
  const [playing, setPlaying] = useState(false);
  const embedSrc = `https://www.youtube.com/embed/${videoId}?autoplay=1&playsinline=1&origin=${encodeURIComponent(WEB_URL)}`;
  const embedHtml = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{margin:0;padding:0}html,body{width:100%;height:100%;background:#000}iframe{width:100%;height:100%;display:block}</style></head><body><iframe src="${embedSrc}" frameborder="0" allow="accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture" allowfullscreen></iframe></body></html>`;

  return (
    <View className="mb-3 rounded-xl overflow-hidden bg-black" style={{ aspectRatio: 16 / 9 }}>
      {playing ? (
        <WebView
          source={{ html: embedHtml, baseUrl: WEB_URL }}
          style={{ flex: 1 }}
          allowsInlineMediaPlayback
          allowsFullscreenVideo
          mediaPlaybackRequiresUserAction={false}
          scrollEnabled={false}
        />
      ) : (
        <TouchableOpacity onPress={() => setPlaying(true)} className="flex-1">
          <Image
            source={{ uri: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` }}
            className="w-full h-full"
            resizeMode="cover"
          />
          <View className="absolute inset-0 items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.25)' }}>
            <View className="w-14 h-14 rounded-full items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
              <Ionicons name="play" size={26} color="white" style={{ marginLeft: 3 }} />
            </View>
          </View>
        </TouchableOpacity>
      )}
    </View>
  );
}
