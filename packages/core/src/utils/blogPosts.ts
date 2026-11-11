// Shared rules for Inside SingJam posts (see migration 232).

export const BLOG_NAME = "Inside SingJam";
export const BLOG_ORIGIN = "https://inside.singjam.org";

export type BlogPostSummary = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  cover_image_url: string | null;
  author_name: string | null;
  published_at: string | null;
};

export type BlogPost = BlogPostSummary & { body_md: string };

export const BLOG_SUMMARY_COLUMNS = "id, slug, title, summary, cover_image_url, author_name, published_at";
export const BLOG_POST_COLUMNS = `${BLOG_SUMMARY_COLUMNS}, body_md`;

/** "November 2026 engineering update!" → "november-2026-engineering-update" (matches the table's slug check). */
export function slugifyBlogTitle(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/, "");
}

export function isValidBlogSlug(slug: string): boolean {
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug);
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
