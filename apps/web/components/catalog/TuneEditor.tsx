"use client";

import { useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/client";
import { CreditsEditor, Section, TagsEditor, useCatalogSave, YearPrecisionField, type Credit, type Person } from "@/components/catalog/CatalogBits";
import { personIdFor, syncTags } from "@/components/catalog/catalogWrites";

export type TuneEditorProps = {
  tune: { id: string; label: string; name: string | null; meter: string | null; fixed_melody: boolean; year: number | null; year_precision: string; published_in: string | null; recording_url: string | null; notes: string | null };
  credits: Credit[];
  tagIds: string[];
  tagOptions: { id: string; name: string; type: string }[];
  people: Person[];
  songs: { id: string; slug: string | null; title: string; text: string | null }[];
};

export default function TuneEditor(props: TuneEditorProps) {
  const { tune } = props;
  const db = supabaseBrowser();
  const [d, setD] = useState({
    name: tune.name ?? "", meter: tune.meter ?? "", fixed_melody: tune.fixed_melody, year: tune.year?.toString() ?? "", year_precision: tune.year_precision ?? "exact", published_in: tune.published_in ?? "",
    recording_url: tune.recording_url ?? "", notes: tune.notes ?? "",
  });
  const { status, run } = useCatalogSave();

  return (
    <div className="space-y-5">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <Link href="/song-editor/tunes" className="text-xs font-medium uppercase tracking-wide text-teal-700 hover:underline">Tunes</Link>
          <h1 className="text-xl font-semibold text-slate-900">{tune.label}</h1>
          <p className="text-sm text-slate-500">Shown as its name, else its composers, else its community, else its mode.</p>
        </div>
        {status && <span className="text-sm text-slate-500">{status}</span>}
      </div>

      <Section title="Details">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm text-slate-600">Name (if it has one)<input id="tune-name" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="Nettleton" className="input mt-1" /></label>
          <label className="text-sm text-slate-600">Meter<input id="tune-meter" value={d.meter} onChange={(e) => setD({ ...d, meter: e.target.value })} placeholder="8.7.8.7 D" className="input mt-1" /></label>
          <label className="text-sm text-slate-600">Year<input id="tune-year" value={d.year} onChange={(e) => setD({ ...d, year: e.target.value })} inputMode="numeric" className="input mt-1" /></label>
          <YearPrecisionField id="tune-year-precision" value={d.year_precision} onChange={(year_precision) => setD({ ...d, year_precision })} />
          <label className="text-sm text-slate-600">First published in<input id="tune-published-in" value={d.published_in} onChange={(e) => setD({ ...d, published_in: e.target.value })} placeholder="Wyeth's Repository of Sacred Music" className="input mt-1" /></label>
          <label className="text-sm text-slate-600">Reference recording (link)<input id="tune-recording" value={d.recording_url} onChange={(e) => setD({ ...d, recording_url: e.target.value })} placeholder="https://www.youtube.com/watch?v=…" className="input mt-1" /></label>
          <label className="flex items-center gap-2 text-sm text-slate-600 sm:col-span-2">
            <input type="checkbox" checked={!d.fixed_melody} onChange={(e) => setD({ ...d, fixed_melody: !e.target.checked })} />
            No fixed melody: sung in a mode (a raga or maqam; tag it below)
          </label>
          <label className="text-sm text-slate-600 sm:col-span-2">Notes<textarea id="tune-notes" value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} rows={3} className="input mt-1" /></label>
        </div>
        <button
          type="button"
          onClick={() => run(() => db.from("tunes").update({
            name: d.name.trim() || null, meter: d.meter.trim() || null, fixed_melody: d.fixed_melody,
            year: d.year.trim() ? parseInt(d.year, 10) : null, year_precision: d.year_precision, published_in: d.published_in.trim() || null, recording_url: d.recording_url.trim() || null, notes: d.notes.trim() || null,
          }).eq("id", tune.id))}
          className="rounded-full bg-amber-500 px-4 py-1.5 text-sm font-semibold text-white hover:bg-amber-400"
        >
          Save details
        </button>
      </Section>

      <Section title="Composers">
        <CreditsEditor
          credits={props.credits}
          roles={["composer", "arranger", "adapter"]}
          people={props.people}
          onAdd={(name, role) => run(async () => {
            const person_id = await personIdFor(name, props.people);
            const { error } = await db.from("tune_credits").insert({ tune_id: tune.id, person_id, role });
            if (error) throw error;
          })}
          onRemove={(c) => run(() => db.from("tune_credits").delete().eq("tune_id", tune.id).eq("person_id", c.person_id).eq("role", c.role))}
        />
      </Section>

      <Section title="Tags">
        <TagsEditor label="Community, mode, rhythm, culture" options={props.tagOptions} selected={props.tagIds} onChange={(ids) => run(() => syncTags("tune_tags", "tune_id", tune.id, props.tagIds, ids))} />
      </Section>

      <Section title="Songs with this tune">
        <ul className="space-y-1">
          {props.songs.length === 0 && <li className="text-sm text-slate-400">No songs yet. Link one from the song editor.</li>}
          {props.songs.map((s) => (
            <li key={s.id} className="text-sm">
              <Link href={`/song-editor/songs/${s.slug ?? s.id}`} className="text-slate-700 hover:underline">{s.title}</Link>
              <span className="text-slate-400"> · {s.text ?? "no text linked"}</span>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
