"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BLOG_POST_COLUMNS, blogPostUrl, slugifyBlogTitle } from "@singjam/core";
import { supabaseBrowser } from "@/lib/supabase/client";
import BlogBody from "@/components/BlogBody";

type Form = {
  title: string;
  slug: string;
  summary: string;
  author_name: string;
  cover_image_url: string;
  body_md: string;
  status: "draft" | "published";
  published_at: string;
};

const EMPTY: Form = {
  title: "",
  slug: "",
  summary: "",
  author_name: "",
  cover_image_url: "",
  body_md: "",
  status: "draft",
  published_at: "",
};

const input = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500";

function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export default function AdminBlogEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const isNew = id === "new";
  const router = useRouter();
  const [form, setForm] = useState<Form>(EMPTY);
  const [slugTouched, setSlugTouched] = useState(!isNew);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [tab, setTab] = useState<"write" | "preview">("write");

  useEffect(() => {
    if (isNew) return;
    supabaseBrowser()
      .from("blog_posts")
      .select(`${BLOG_POST_COLUMNS}, status`)
      .eq("id", id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error || !data) setMessage({ kind: "error", text: error?.message ?? "Post not found" });
        else
          setForm({
            title: data.title,
            slug: data.slug,
            summary: data.summary ?? "",
            author_name: data.author_name ?? "",
            cover_image_url: data.cover_image_url ?? "",
            body_md: data.body_md,
            status: data.status,
            published_at: toLocalInput(data.published_at),
          });
        setLoading(false);
      });
  }, [id, isNew]);

  function set<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((f) => {
      const next = { ...f, [key]: value };
      if (key === "title" && !slugTouched) next.slug = slugifyBlogTitle(value as string);
      return next;
    });
  }

  async function save(status: Form["status"]) {
    setSaving(true);
    setMessage(null);
    const res = await fetch("/api/admin/blog", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        id: isNew ? undefined : id,
        status,
        published_at: form.published_at ? new Date(form.published_at).toISOString() : null,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setMessage({ kind: "error", text: data.error ?? "Could not save" });
      return;
    }
    setForm((f) => ({ ...f, status, slug: data.slug }));
    setMessage({ kind: "ok", text: status === "published" ? "Published" : "Saved as draft" });
    if (isNew) router.replace(`/admin/blog/${data.id}`);
  }

  async function remove() {
    if (!window.confirm("Delete this post? This can't be undone.")) return;
    const res = await fetch(`/api/admin/blog?id=${id}`, { method: "DELETE" });
    if (res.ok) router.push("/admin/blog");
    else setMessage({ kind: "error", text: "Could not delete" });
  }

  if (loading) return <p className="text-sm text-slate-500">Loading…</p>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/admin/blog" className="text-sm text-slate-500 hover:text-slate-800">← All posts</Link>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${form.status === "published" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>
            {form.status === "published" ? "Published" : "Draft"}
          </span>
        </div>
        {form.status === "published" && form.slug && (
          <a href={blogPostUrl(form.slug)} target="_blank" rel="noopener noreferrer" className="text-sm text-amber-700 hover:underline">
            {blogPostUrl(form.slug).replace("https://", "")}
          </a>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1 sm:col-span-2">
          <span className="text-sm font-medium text-slate-700">Title</span>
          <input className={input} value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Inside SingJam — November 2026" />
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium text-slate-700">Slug</span>
          <input
            className={input}
            value={form.slug}
            onChange={(e) => {
              setSlugTouched(true);
              set("slug", e.target.value);
            }}
            placeholder="november-2026"
          />
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium text-slate-700">Author</span>
          <input className={input} value={form.author_name} onChange={(e) => set("author_name", e.target.value)} placeholder="Jane Mendonca" />
        </label>
        <label className="space-y-1 sm:col-span-2">
          <span className="text-sm font-medium text-slate-700">Summary</span>
          <input className={input} value={form.summary} onChange={(e) => set("summary", e.target.value)} placeholder="One line shown on the blog list and link previews" />
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium text-slate-700">Cover image URL (optional)</span>
          <input className={input} value={form.cover_image_url} onChange={(e) => set("cover_image_url", e.target.value)} placeholder="https://…" />
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium text-slate-700">Publish date (blank = when published)</span>
          <input type="datetime-local" className={input} value={form.published_at} onChange={(e) => set("published_at", e.target.value)} />
        </label>
      </div>

      <div className="space-y-2">
        <div className="flex gap-1 text-sm">
          {(["write", "preview"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`rounded-md px-3 py-1.5 capitalize ${tab === t ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}
            >
              {t}
            </button>
          ))}
          <span className="ml-auto self-center text-xs text-slate-400">Markdown: # headings, **bold**, *italic*, - lists, [links](url), ![images](https://…)</span>
        </div>
        {tab === "write" ? (
          <textarea
            className={`${input} min-h-[420px] font-mono leading-relaxed`}
            value={form.body_md}
            onChange={(e) => set("body_md", e.target.value)}
            placeholder={"## What we shipped\n\n- …"}
          />
        ) : (
          <div className="min-h-[420px] rounded-lg border border-slate-200 bg-white p-5">
            <BlogBody markdown={form.body_md} />
          </div>
        )}
      </div>

      {message && <p className={`text-sm ${message.kind === "ok" ? "text-emerald-700" : "text-red-600"}`}>{message.text}</p>}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={() => save("published")}
          className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
        >
          {form.status === "published" ? "Update post" : "Publish"}
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => save("draft")}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {form.status === "published" ? "Unpublish" : "Save draft"}
        </button>
        {!isNew && (
          <button type="button" onClick={remove} className="ml-auto rounded-lg px-4 py-2 text-sm text-red-600 hover:bg-red-50">
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
