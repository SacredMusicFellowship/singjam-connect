// Inside SingJam posts are Markdown files in apps/web/content/blog/<slug>.md,
// each opening with a frontmatter block (see that folder's README).

export const BLOG_NAME = "Inside SingJam";
export const BLOG_ORIGIN = "https://inside.singjam.org";

export type BlogPostSummary = {
  slug: string;
  title: string;
  summary: string | null;
  cover_image_url: string | null;
  author_name: string | null;
  published_at: string;
};

export type BlogPost = BlogPostSummary & { body_md: string; draft: boolean };

export function isValidBlogSlug(slug: string): boolean {
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug);
}

/** Splits `---`-fenced `key: value` lines from the body. Values may be wrapped in quotes. */
export function parseBlogFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
  const text = raw.replace(/\r\n?/g, "\n").replace(/^﻿/, "");
  if (!text.startsWith("---\n")) return { meta: {}, body: text };
  const end = text.indexOf("\n---", 4);
  if (end === -1) return { meta: {}, body: text };

  const meta: Record<string, string> = {};
  for (const line of text.slice(4, end).split("\n")) {
    const colon = line.indexOf(":");
    if (colon <= 0) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    let value = line.slice(colon + 1).trim();
    if (value.length >= 2 && (value[0] === '"' || value[0] === "'") && value.endsWith(value[0])) {
      value = value.slice(1, -1);
    }
    meta[key] = value;
  }
  const afterFence = text.indexOf("\n", end + 4);
  return { meta, body: afterFence === -1 ? "" : text.slice(afterFence + 1).replace(/^\n+/, "") };
}

/** Builds a post from its file, or explains what's wrong with it so a bad post fails CI instead of the site. */
export function blogPostFromFile(slug: string, raw: string): { ok: true; post: BlogPost } | { ok: false; error: string } {
  if (!isValidBlogSlug(slug)) {
    return { ok: false, error: `${slug}.md: file name must be lowercase letters, numbers and single hyphens` };
  }
  const { meta, body } = parseBlogFrontmatter(raw);
  if (!meta.title) return { ok: false, error: `${slug}.md: missing "title:"` };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(meta.date ?? "") || Number.isNaN(Date.parse(meta.date))) {
    return { ok: false, error: `${slug}.md: "date:" must be YYYY-MM-DD` };
  }
  if (meta.cover && !/^https:\/\//i.test(meta.cover)) {
    return { ok: false, error: `${slug}.md: "cover:" must be an https:// URL` };
  }
  return {
    ok: true,
    post: {
      slug,
      title: meta.title,
      summary: meta.summary || null,
      cover_image_url: meta.cover || null,
      author_name: meta.author || null,
      published_at: `${meta.date}T00:00:00.000Z`,
      draft: meta.draft === "true",
      body_md: body,
    },
  };
}

/** Published posts, newest first; slug breaks ties so the order is stable. */
export function sortBlogPosts<T extends BlogPostSummary>(posts: T[]): T[] {
  return [...posts].sort((a, b) => b.published_at.localeCompare(a.published_at) || a.slug.localeCompare(b.slug));
}

export function blogSummary(post: BlogPost): BlogPostSummary {
  const { slug, title, summary, cover_image_url, author_name, published_at } = post;
  return { slug, title, summary, cover_image_url, author_name, published_at };
}

/** The canonical, shareable address of a post. */
export function blogPostUrl(slug: string): string {
  return `${BLOG_ORIGIN}/${slug}`;
}

/** "November 11, 2026" in UTC, so a post's date reads the same on the server and every device. */
export function formatBlogDate(publishedAt: string | null | undefined): string | null {
  if (!publishedAt) return null;
  return new Date(publishedAt).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/** Whole minutes at ~220 words a minute, never less than one. */
export function blogReadingMinutes(bodyMd: string): number {
  const words = bodyMd.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}
