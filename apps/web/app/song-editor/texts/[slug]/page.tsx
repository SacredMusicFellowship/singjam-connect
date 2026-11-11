import { notFound } from "next/navigation";
import { fetchAllRows } from "@singjam/core";
import { getServerSupabase } from "@/lib/supabase/cached";
import TextEditor from "@/components/catalog/TextEditor";

export default async function TextPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await getServerSupabase();
  const { data: text } = await supabase
    .from("texts")
    .select("id, title, first_line, kind, year, year_precision, notes, text_titles(id, title, kind), text_credits(person_id, role, people(name)), text_sources(*), text_tags(tag_id), songs(id, slug, title, tunes(tune_label))")
    .eq("slug", decodeURIComponent(slug))
    .maybeSingle();
  if (!text) notFound();
  const [tagOptions, people] = await Promise.all([
    fetchAllRows<{ id: string; name: string; type: string }>((f, t) =>
      supabase.from("tags").select("id, name, type").in("type", ["language", "community", "culture", "occasion", "form"]).order("name").order("id").range(f, t)
    ),
    fetchAllRows<{ id: string; name: string }>((f, t) => supabase.from("people").select("id, name").order("name").order("id").range(f, t)),
  ]);
  const t = text as any;
  return (
    <TextEditor
      text={{ id: t.id, title: t.title, first_line: t.first_line, kind: t.kind, year: t.year, year_precision: t.year_precision, notes: t.notes }}
      titles={t.text_titles ?? []}
      credits={(t.text_credits ?? []).map((c: any) => ({ person_id: c.person_id, role: c.role, name: c.people?.name ?? "?" }))}
      sources={t.text_sources ?? []}
      tagIds={(t.text_tags ?? []).map((x: any) => x.tag_id)}
      tagOptions={tagOptions}
      people={people}
      songs={(t.songs ?? []).map((s: any) => ({ id: s.id, slug: s.slug, title: s.title, tune: s.tunes?.tune_label ?? null }))}
    />
  );
}
