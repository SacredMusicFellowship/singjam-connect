import { isValidBlogSlug, slugifyBlogTitle } from "@singjam/core";

export type BlogPostInput = {
  title?: unknown;
  slug?: unknown;
  summary?: unknown;
  body_md?: unknown;
  cover_image_url?: unknown;
  author_name?: unknown;
  status?: unknown;
  published_at?: unknown;
};

export type BlogPostRow = {
  title: string;
  slug: string;
  summary: string | null;
  body_md: string;
  cover_image_url: string | null;
  author_name: string | null;
  status: "draft" | "published";
  published_at: string | null;
};

const optional = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

// Publishing without a date stamps it now; a draft keeps any date it had so
// unpublishing and republishing doesn't move the post in the list.
export function blogPostPayload(
  input: BlogPostInput,
  now: Date = new Date()
): { ok: true; row: BlogPostRow } | { ok: false; error: string } {
  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (!title) return { ok: false, error: "Title is required" };

  const slug = optional(input.slug) ?? slugifyBlogTitle(title);
  if (!isValidBlogSlug(slug)) {
    return { ok: false, error: "Slug can only use lowercase letters, numbers and single hyphens" };
  }

  const status = input.status === "published" ? "published" : "draft";

  const cover = optional(input.cover_image_url);
  if (cover && !/^https:\/\//i.test(cover)) return { ok: false, error: "Cover image must be an https:// URL" };

  let publishedAt = optional(input.published_at);
  if (publishedAt && Number.isNaN(Date.parse(publishedAt))) return { ok: false, error: "Publish date is not a valid date" };
  if (publishedAt) publishedAt = new Date(publishedAt).toISOString();
  if (status === "published" && !publishedAt) publishedAt = now.toISOString();

  return {
    ok: true,
    row: {
      title,
      slug,
      summary: optional(input.summary),
      body_md: typeof input.body_md === "string" ? input.body_md : "",
      cover_image_url: cover,
      author_name: optional(input.author_name),
      status,
      published_at: publishedAt,
    },
  };
}
