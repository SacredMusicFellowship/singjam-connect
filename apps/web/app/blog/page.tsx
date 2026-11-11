import type { Metadata } from "next";
import Link from "next/link";
import {
  BLOG_NAME,
  BLOG_ORIGIN,
  BLOG_SUMMARY_COLUMNS,
  fetchAllRows,
  formatBlogDate,
  type BlogPostSummary,
} from "@singjam/core";
import { supabaseAnon } from "@/lib/supabase/anon";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: BLOG_NAME,
  description: "Inside SingJam is our monthly engineering blog: what we built, what we learned, and what's next.",
  alternates: { canonical: BLOG_ORIGIN },
  openGraph: { title: BLOG_NAME, url: BLOG_ORIGIN },
};

export default async function BlogIndexPage() {
  const supabase = supabaseAnon();
  const posts = await fetchAllRows<BlogPostSummary>((from, to) =>
    supabase
      .from("blog_posts")
      .select(BLOG_SUMMARY_COLUMNS)
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .order("id")
      .range(from, to)
  );

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-amber-600">Engineering blog</p>
        <h1 className="text-2xl font-semibold text-slate-900 sm:text-3xl">{BLOG_NAME}</h1>
        <p className="text-slate-600">What we built, what we learned, and what&apos;s next. A new post every month.</p>
      </header>

      {posts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          The first post is on its way.
        </div>
      ) : (
        <ul className="space-y-4">
          {posts.map((post) => (
            <li key={post.id}>
              <Link
                href={`/blog/${post.slug}`}
                className="block overflow-hidden rounded-xl border border-slate-200 bg-white transition-colors hover:border-amber-300"
              >
                {post.cover_image_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={post.cover_image_url} alt="" loading="lazy" className="aspect-[2/1] w-full object-cover" />
                )}
                <div className="space-y-1.5 p-4 sm:p-5">
                  <p className="text-xs text-slate-500">
                    {[formatBlogDate(post.published_at), post.author_name].filter(Boolean).join(" · ")}
                  </p>
                  <h2 className="text-lg font-semibold text-slate-900">{post.title}</h2>
                  {post.summary && <p className="text-sm text-slate-600">{post.summary}</p>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
