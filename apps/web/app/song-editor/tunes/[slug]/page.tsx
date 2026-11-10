import { notFound } from "next/navigation";
import { fetchAllRows } from "@singjam/core";
import { getServerSupabase } from "@/lib/supabase/cached";
import TuneEditor from "@/components/catalog/TuneEditor";

export default async function TunePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await getServerSupabase();
  const { data: tune } = await supabase
    .from("tunes")
    .select("id, name, meter, fixed_melody, year, year_precision, published_in, recording_url, notes, tune_label, tune_credits(person_id, role, people(name)), tune_tags(tag_id), songs(id, slug, title, texts(title))")
    .eq("slug", decodeURIComponent(slug))
    .maybeSingle();
  if (!tune) notFound();
  const [tagOptions, people] = await Promise.all([
    fetchAllRows<{ id: string; name: string; type: string }>((f, t) =>
      supabase.from("tags").select("id, name, type").in("type", ["community", "mode", "rhythm", "culture"]).order("name").order("id").range(f, t)
    ),
    fetchAllRows<{ id: string; name: string }>((f, t) => supabase.from("people").select("id, name").order("name").order("id").range(f, t)),
  ]);
  const t = tune as any;
  return (
    <TuneEditor
      tune={{ id: t.id, label: t.tune_label, name: t.name, meter: t.meter, fixed_melody: t.fixed_melody, year: t.year, year_precision: t.year_precision, published_in: t.published_in, recording_url: t.recording_url, notes: t.notes }}
      credits={(t.tune_credits ?? []).map((c: any) => ({ person_id: c.person_id, role: c.role, name: c.people?.name ?? "?" }))}
      tagIds={(t.tune_tags ?? []).map((x: any) => x.tag_id)}
      tagOptions={tagOptions}
      people={people}
      songs={(t.songs ?? []).map((s: any) => ({ id: s.id, slug: s.slug, title: s.title, text: s.texts?.title ?? null }))}
    />
  );
}
