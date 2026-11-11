import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, RefreshControl, Text, TouchableOpacity, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { BLOG_NAME, BLOG_SUMMARY_COLUMNS, fetchAllRows, formatBlogDate, type BlogPostSummary } from '@singjam/core';
import { supabase } from '@/lib/supabase';
import ContentContainer from '@/components/ContentContainer';

// Mirrors web's /blog (apps/web/app/blog/page.tsx).
export default function BlogIndexScreen() {
  const router = useRouter();
  const [posts, setPosts] = useState<BlogPostSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const rows = await fetchAllRows<BlogPostSummary>((from, to) =>
        supabase
          .from('blog_posts')
          .select(BLOG_SUMMARY_COLUMNS)
          .eq('status', 'published')
          .order('published_at', { ascending: false })
          .order('id')
          .range(from, to)
      );
      setPosts(rows);
      setError(null);
    } catch {
      setError("Couldn't load posts. Pull to try again.");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  return (
    <View className="flex-1 bg-slate-50">
      <Stack.Screen options={{ title: BLOG_NAME, headerTintColor: '#d97706' }} />
      <ContentContainer>
        <FlatList
          data={posts ?? []}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 24, paddingBottom: 40, gap: 16 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
          ListHeaderComponent={
            <View className="gap-2">
              <Text className="text-xs font-semibold uppercase tracking-wider text-amber-600">Engineering blog</Text>
              <Text className="text-2xl font-semibold text-slate-900">{BLOG_NAME}</Text>
              <Text className="text-base text-slate-600">What we built, what we learned, and what's next. A new post every month.</Text>
            </View>
          }
          ListEmptyComponent={
            posts === null && !error ? (
              <ActivityIndicator className="mt-8" color="#d97706" />
            ) : (
              <View className="rounded-xl border border-dashed border-slate-300 bg-white p-8">
                <Text className="text-center text-sm text-slate-500">{error ?? 'The first post is on its way.'}</Text>
              </View>
            )
          }
          renderItem={({ item: post }) => (
            <TouchableOpacity
              onPress={() => router.push(`/blog/${post.slug}` as any)}
              className="overflow-hidden rounded-xl border border-slate-200 bg-white"
            >
              {post.cover_image_url && (
                <Image source={{ uri: post.cover_image_url }} className="w-full" style={{ aspectRatio: 2 }} resizeMode="cover" />
              )}
              <View className="gap-1.5 p-4">
                <Text className="text-xs text-slate-500">
                  {[formatBlogDate(post.published_at), post.author_name].filter(Boolean).join(' · ')}
                </Text>
                <Text className="text-lg font-semibold text-slate-900">{post.title}</Text>
                {post.summary && <Text className="text-sm text-slate-600">{post.summary}</Text>}
              </View>
            </TouchableOpacity>
          )}
        />
      </ContentContainer>
    </View>
  );
}
