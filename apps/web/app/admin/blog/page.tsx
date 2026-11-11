"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BLOG_NAME, fetchAllRows, formatBlogDate } from "@singjam/core";
import { supabaseBrowser } from "@/lib/supabase/client";

type Row = { id: string; slug: string; title: string; status: string; published_at: string | null; updated_at: string };

export default function AdminBlogPage() {
  const [posts, setPosts] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = supabaseBrowser();
    fetchAllRows<Row>((from, to) =>
      supabase
        .from("blog_posts")
        .select("id, slug, title, status, published_at, updated_at")
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, to)
    )
      .then(setPosts)
      .catch((e) => setError(e.message ?? "Could not load posts"));
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{BLOG_NAME}</h1>
          <p className="text-sm text-slate-500">Monthly engineering blog posts. Published posts show on web, inside.singjam.org and the app.</p>
        </div>
        <Link href="/admin/blog/new" className="shrink-0 rounded-lg bg-amber-500 px-3 py-2 text-sm font-medium text-white hover:bg-amber-600">
          New post
        </Link>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {!posts && !error && <p className="text-sm text-slate-500">Loading…</p>}
      {posts?.length === 0 && <p className="text-sm text-slate-500">No posts yet.</p>}

      {posts && posts.length > 0 && (
        <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
          {posts.map((p) => (
            <li key={p.id}>
              <Link href={`/admin/blog/${p.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50">
                <div className="min-w-0">
                  <div className="truncate font-medium text-slate-900">{p.title}</div>
                  <div className="truncate text-xs text-slate-500">
                    /{p.slug}
                    {p.published_at ? ` · ${formatBlogDate(p.published_at)}` : ""}
                  </div>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                    p.status === "published" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {p.status === "published" ? "Published" : "Draft"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
