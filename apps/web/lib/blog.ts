import fs from "node:fs";
import path from "node:path";
import { blogPostFromFile, sortBlogPosts, type BlogPost } from "@singjam/core";

export const BLOG_DIR = path.join(process.cwd(), "content/blog");

// Files starting with "_" (the template) and the README aren't posts.
export function blogPostFiles(dir = BLOG_DIR): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith(".md") && !f.startsWith("_") && f !== "README.md");
}

/** Every post, drafts included. Throws listing every bad file so a broken post fails the build. */
export function loadAllBlogPosts(dir = BLOG_DIR): BlogPost[] {
  const posts: BlogPost[] = [];
  const errors: string[] = [];
  for (const file of blogPostFiles(dir)) {
    const result = blogPostFromFile(file.slice(0, -3), fs.readFileSync(path.join(dir, file), "utf8"));
    if (result.ok) posts.push(result.post);
    else errors.push(result.error);
  }
  if (errors.length) throw new Error(`Invalid blog posts:\n${errors.join("\n")}`);
  return sortBlogPosts(posts);
}

// Drafts show when running locally (npm run dev) so a post can be previewed before its PR.
export function loadBlogPosts(dir = BLOG_DIR): BlogPost[] {
  const showDrafts = process.env.NODE_ENV === "development";
  return loadAllBlogPosts(dir).filter((p) => showDrafts || !p.draft);
}

export function getBlogPost(slug: string): BlogPost | null {
  return loadBlogPosts().find((p) => p.slug === slug) ?? null;
}
