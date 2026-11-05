import { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, Image, useWindowDimensions } from 'react-native';
import { useRouter, useFocusEffect, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { contentWidthStyle } from '@/components/ContentContainer';

// Web's `sm:` breakpoint — above this the header grows nav links and the
// bottom tab bar hides, mirroring web's tablet/desktop top nav.
export const WIDE_BREAKPOINT = 640;

const NAV_LINKS = [
  { label: 'Jams', path: '/jams' },
  { label: 'Sets', path: '/sets' },
  { label: 'Repertoire', path: '/' },
  { label: 'Friends', path: '/friends' },
] as const;

// Mirrors the web mobile header (apps/web/app/layout.tsx + MobileHeaderProfile):
// slate-900 bar, amber logo tile + wordmark, search + notification bell,
// amber Sign in pill for guests.
export default function BrandHeader() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const wide = width >= WIDE_BREAKPOINT;
  const { session, profile } = useAuth();
  const [unread, setUnread] = useState(0);
  const initial = (profile?.display_name ?? profile?.username ?? '?')[0].toUpperCase();

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      if (!session) { setUnread(0); return; }
      supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', session.user.id)
        .eq('read', false)
        .then(({ count }) => { if (!cancelled) setUnread(count ?? 0); });
      return () => { cancelled = true; };
    }, [session])
  );

  return (
    <View className="bg-slate-900" style={{ paddingTop: insets.top }}>
      <View style={contentWidthStyle} className="flex-row items-center justify-between px-4 py-3">
        <View className="flex-row items-center" style={{ gap: 10 }}>
          <View className="h-8 w-8 items-center justify-center rounded-lg bg-amber-500">
            <Ionicons name="musical-notes" size={16} color="white" />
          </View>
          <Text className="text-sm font-semibold text-white">SingJam</Text>
        </View>

        <View className="flex-row items-center" style={{ gap: 4 }}>
          {wide && NAV_LINKS.map((link) => {
            const active = link.path === '/' ? pathname === '/' : pathname.startsWith(link.path);
            return (
              <TouchableOpacity
                key={link.path}
                onPress={() => router.navigate(link.path as any)}
                className="rounded-full px-3 py-1.5"
              >
                <Text className={`text-sm ${active ? 'text-white font-semibold' : 'text-slate-300'}`}>
                  {link.label}
                </Text>
              </TouchableOpacity>
            );
          })}
          {wide && <View className="mx-2 h-4 w-px bg-slate-700" />}
          <TouchableOpacity
            onPress={() => router.push('/songs' as any)}
            className="h-9 w-9 items-center justify-center rounded-full"
            hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
            accessibilityLabel="Search songs"
          >
            <Ionicons name="search" size={20} color="#cbd5e1" />
          </TouchableOpacity>

          {session ? (
            <>
            <TouchableOpacity
              onPress={() => router.push('/notifications' as any)}
              className="h-9 w-9 items-center justify-center rounded-full"
              hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
              accessibilityLabel="Notifications"
            >
              <Ionicons name="notifications-outline" size={20} color="#cbd5e1" />
              {unread > 0 && (
                <View className="absolute right-0.5 top-0.5 h-4 w-4 items-center justify-center rounded-full bg-amber-500">
                  <Text className="text-[10px] font-bold text-white">{unread > 9 ? '9+' : unread}</Text>
                </View>
              )}
            </TouchableOpacity>
            {wide && (
              <TouchableOpacity
                onPress={() => router.navigate('/profile' as any)}
                className="ml-1 h-8 w-8 overflow-hidden rounded-full"
                accessibilityLabel="Profile"
              >
                {profile?.avatar_url ? (
                  <Image source={{ uri: profile.avatar_url }} className="h-full w-full" />
                ) : (
                  <View className="h-full w-full items-center justify-center bg-slate-600">
                    <Text className="text-xs font-medium text-slate-200">{initial}</Text>
                  </View>
                )}
              </TouchableOpacity>
            )}
            </>
          ) : (
            <TouchableOpacity
              onPress={() => router.push('/(auth)/sign-in' as any)}
              className="rounded-full bg-amber-500 px-3 py-1.5"
            >
              <Text className="text-xs font-semibold text-white">Sign in</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}
