import { NextResponse } from "next/server";
import { blogSummary } from "@singjam/core";
import { loadBlogPosts } from "@/lib/blog";

export const dynamic = "force-static";

// Read by the native app; rebuilt with each deploy, like the blog pages.
export function GET() {
  return NextResponse.json({ posts: loadBlogPosts().map(blogSummary) });
}
