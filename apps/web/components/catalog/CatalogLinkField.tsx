"use client";

import { useState } from "react";
import Link from "next/link";
import TagCombobox from "@/components/TagCombobox";
import { supabaseBrowser } from "@/lib/supabase/client";
import { personIdFor } from "@/components/catalog/catalogWrites";

type Option = { id: string; name: string; slug: string };
type Lookup = { id: string; name: string };

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

// A song's text or tune: pick an existing one, or create one inline. Creating
// warns about a same-named one first, and a tune needs a name, a composer or a
// community so it never shows up as a bare "Traditional".
export default function CatalogLinkField({ kind, songTitle, options, value, savedValue, onChange, onCreated, people, communities }: {
  kind: "text" | "tune";
  songTitle: string;
  options: Option[];
  value: string;
  savedValue: string;
  onChange: (id: string) => void;
  onCreated: (row: Option) => void;
  people: Lookup[];
  communities: Lookup[];
}) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [composer, setComposer] = useState("");
  const [community, setCommunity] = useState("");
  const [duplicate, setDuplicate] = useState<Option | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = kind === "text" ? "Text" : "Tune";
  const current = options.find((o) => o.id === value);

  function startCreating() {
    setName(kind === "text" ? songTitle.trim() : "");
    setComposer("");
    setCommunity("");
    setDuplicate(null);
    setError(null);
    setCreating(true);
  }

  async function create(allowDuplicate: boolean) {
    const n = name.trim();
    if (kind === "text" ? !n : !n && !composer.trim() && !community) {
      setError(kind === "text" ? "Give the text a title." : "Give the tune a name, a composer or a community.");
      return;
    }
    const existing = n ? options.find((o) => same(o.name, n)) : undefined;
    if (existing && !allowDuplicate) { setDuplicate(existing); return; }
    setBusy(true);
    setError(null);
    try {
      const db = supabaseBrowser();
      if (kind === "text") {
        const { data, error } = await db.from("texts").insert({ title: n, slug: "x" }).select("id, title, slug").single();
        if (error || !data) throw error ?? new Error("Couldn't create the text.");
        onCreated({ id: data.id, name: data.title, slug: data.slug });
      } else {
        const { data: tune, error } = await db.from("tunes").insert({ name: n || null, slug: "x" }).select("id").single();
        if (error || !tune) throw error ?? new Error("Couldn't create the tune.");
        if (composer.trim()) {
          const person_id = await personIdFor(composer.trim(), people);
          const { error: e } = await db.from("tune_credits").insert({ tune_id: tune.id, person_id, role: "composer" });
          if (e) throw e;
        }
        if (community) {
          const { error: e } = await db.from("tune_tags").insert({ tune_id: tune.id, tag_id: community });
          if (e) throw e;
        }
        const { data, error: e } = await db.from("tunes").select("id, slug, tune_label").eq("id", tune.id).single();
        if (e || !data) throw e ?? new Error("Couldn't load the new tune.");
        onCreated({ id: data.id, name: data.tune_label, slug: data.slug });
      }
      setCreating(false);
    } catch (e: any) {
      setError(e?.message ?? `Couldn't create the ${kind}.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <TagCombobox
        label={label}
        options={options}
        selected={value ? [value] : []}
        onChange={(ids) => onChange(ids.at(-1) ?? "")}
        placeholder={`Search ${kind}s…`}
        optional
      />
      <div className="flex flex-wrap items-center gap-3 text-xs">
        {current && (
          <Link href={`/song-editor/${kind}s/${current.slug}`} className="text-teal-700 hover:underline">Edit {kind}</Link>
        )}
        {!creating && (
          <button type="button" onClick={startCreating} className="text-teal-700 hover:underline">New {kind}</button>
        )}
        {value !== savedValue && <span className="text-amber-700">Linked. Save the song to keep it.</span>}
      </div>
      {creating && (
        <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <input value={name} onChange={(e) => { setName(e.target.value); setDuplicate(null); }} placeholder={kind === "text" ? "Title" : "Name, if it has one (New Britain)"} className="input" aria-label={kind === "text" ? "Title" : "Tune name"} />
          {kind === "tune" && (
            <>
              <input list="catalog-tune-people" value={composer} onChange={(e) => setComposer(e.target.value)} placeholder="Composer" className="input" aria-label="Composer" />
              <datalist id="catalog-tune-people">{people.map((p) => <option key={p.id} value={p.name} />)}</datalist>
              <select value={community} onChange={(e) => setCommunity(e.target.value)} className="input" aria-label="Community">
                <option value="">Community (optional)</option>
                {communities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </>
          )}
          {duplicate ? (
            <div className="space-y-2 text-sm text-slate-700">
              <p>A {kind} called &ldquo;{duplicate.name}&rdquo; already exists.</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => { onChange(duplicate.id); setCreating(false); }} className="rounded-full bg-amber-500 px-3 py-1 text-sm font-semibold text-white hover:bg-amber-400">
                  Link that one
                </button>
                <button type="button" disabled={busy} onClick={() => create(true)} className="rounded-full border border-slate-300 px-3 py-1 text-sm hover:bg-white disabled:opacity-50">
                  Create another
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <button type="button" disabled={busy} onClick={() => create(false)} className="rounded-full bg-amber-500 px-3 py-1 text-sm font-semibold text-white hover:bg-amber-400 disabled:opacity-50">
                {busy ? "Creating…" : `Create and link`}
              </button>
              <button type="button" onClick={() => setCreating(false)} className="rounded-full px-3 py-1 text-sm text-slate-500 hover:bg-white">Cancel</button>
            </div>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}
