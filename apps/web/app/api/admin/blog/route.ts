import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { blogPostPayload } from "@/lib/blogPostPayload";

function revalidateBlog(...slugs: (string | null | undefined)[]) {
  revalidatePath("/blog");
  for (const slug of slugs) if (slug) revalidatePath(`/blog/${slug}`);
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { supabase } = auth;

  const body = await req.json().catch(() => ({}));
  const parsed = blogPostPayload(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const id = typeof body.id === "string" ? body.id : null;
  const previousSlug = id
    ? (await supabase.from("blog_posts").select("slug").eq("id", id).maybeSingle()).data?.slug
    : null;

  const query = id
    ? supabase.from("blog_posts").update(parsed.row).eq("id", id)
    : supabase.from("blog_posts").insert(parsed.row);
  const { data, error } = await query.select("id, slug").single();

  if (error) {
    const taken = error.code === "23505";
    return NextResponse.json(
      { error: taken ? "Another post already uses that slug" : error.message },
      { status: taken ? 409 : 500 }
    );
  }

  revalidateBlog(data.slug, previousSlug);
  return NextResponse.json({ id: data.id, slug: data.slug });
}

export async function DELETE(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { supabase } = auth;

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const { data, error } = await supabase.from("blog_posts").delete().eq("id", id).select("slug").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  revalidateBlog(data?.slug);
  return NextResponse.json({ ok: true });
}
