import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BLOG_NAME, blogPostUrl, blogReadingMinutes, formatBlogDate } from "@singjam/core";
import { getBlogPost, loadBlogPosts } from "@/lib/blog";
import BlogBody from "@/components/BlogBody";

export const dynamicParams = false;

export function generateStaticParams() {
  return loadBlogPosts().map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = getBlogPost(slug);
  if (!post) return { title: BLOG_NAME };
  const url = blogPostUrl(post.slug);
  return {
    title: { absolute: `${post.title} | ${BLOG_NAME}` },
    description: post.summary ?? undefined,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      title: post.title,
      description: post.summary ?? undefined,
      url,
      publishedTime: post.published_at ?? undefined,
      images: post.cover_image_url ? [post.cover_image_url] : undefined,
    },
  };
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getBlogPost(slug);
  if (!post) notFound();

  return (
    <article className="mx-auto max-w-2xl space-y-6">
      <Link href="/blog" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <span aria-hidden>←</span> {BLOG_NAME}
      </Link>

      <header className="space-y-3">
        <h1 className="text-2xl font-semibold leading-tight text-slate-900 sm:text-3xl">{post.title}</h1>
        {post.summary && <p className="text-lg text-slate-600">{post.summary}</p>}
        <p className="text-sm text-slate-500">
          {[post.author_name, formatBlogDate(post.published_at), `${blogReadingMinutes(post.body_md)} min read`]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </header>

      {post.cover_image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={post.cover_image_url} alt="" className="w-full rounded-xl border border-slate-200" />
      )}

      <BlogBody markdown={post.body_md} />
    </article>
  );
}
