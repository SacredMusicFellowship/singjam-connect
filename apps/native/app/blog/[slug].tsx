import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, Share, Text, TouchableOpacity, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import {
  BLOG_NAME,
  BLOG_POST_COLUMNS,
  blogPostUrl,
  blogReadingMinutes,
  formatBlogDate,
  type BlogPost,
} from '@singjam/core';
import { supabase } from '@/lib/supabase';
import ContentContainer from '@/components/ContentContainer';
import BlogBody from '@/components/BlogBody';

// Mirrors web's /blog/[slug] (apps/web/app/blog/[slug]/page.tsx).
export default function BlogPostScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const [post, setPost] = useState<BlogPost | null | undefined>(undefined);

  useEffect(() => {
    supabase
      .from('blog_posts')
      .select(BLOG_POST_COLUMNS)
      .eq('slug', slug)
      .eq('status', 'published')
      .maybeSingle()
      .then(({ data }) => setPost((data as BlogPost | null) ?? null));
  }, [slug]);

  return (
    <View className="flex-1 bg-slate-50">
      <Stack.Screen
        options={{
          title: BLOG_NAME,
          headerTintColor: '#d97706',
          headerRight: post
            ? () => (
                <TouchableOpacity onPress={() => Share.share({ message: `${post.title} ${blogPostUrl(post.slug)}`, url: blogPostUrl(post.slug) })}>
                  <Text className="text-base text-amber-600">Share</Text>
                </TouchableOpacity>
              )
            : undefined,
        }}
      />
      <ContentContainer>
        {post === undefined ? (
          <ActivityIndicator className="mt-8" color="#d97706" />
        ) : post === null ? (
          <Text className="mt-8 px-4 text-center text-sm text-slate-500">This post isn't available.</Text>
        ) : (
          <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 24, paddingBottom: 48, gap: 24 }}>
            <View className="gap-3">
              <Text className="text-2xl font-semibold leading-tight text-slate-900">{post.title}</Text>
              {post.summary && <Text className="text-lg text-slate-600">{post.summary}</Text>}
              <Text className="text-sm text-slate-500">
                {[post.author_name, formatBlogDate(post.published_at), `${blogReadingMinutes(post.body_md)} min read`]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </View>
            {post.cover_image_url && (
              <Image
                source={{ uri: post.cover_image_url }}
                className="w-full rounded-xl border border-slate-200"
                style={{ aspectRatio: 2 }}
                resizeMode="cover"
              />
            )}
            <BlogBody markdown={post.body_md} />
          </ScrollView>
        )}
      </ContentContainer>
    </View>
  );
}
