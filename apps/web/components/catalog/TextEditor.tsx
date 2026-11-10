"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatScriptureRef, NEW_TESTAMENT_BOOKS, TANAKH_BOOKS } from "@singjam/core";
import { supabaseBrowser } from "@/lib/supabase/client";
import { CreditsEditor, Section, TagsEditor, type Credit, type Person } from "@/components/catalog/CatalogBits";
import { personIdFor, syncTags } from "@/components/catalog/catalogWrites";

type Source = { id: string; corpus: string; book: string | null; chapter_start: number | null; verse_start: number | null; chapter_end: number | null; verse_end: number | null; citation: string | null; relation: string };
export type TextEditorProps = {
  text: { id: string; title: string; first_line: string | null; kind: string | null; year: number | null; period: string | null; notes: string | null };
  titles: { id: string; title: string; kind: string }[];
  credits: Credit[];
  sources: Source[];
  tagIds: string[];
  tagOptions: { id: string; name: string; type: string }[];
  people: Person[];
  songs: { slug: string | null; id: string; title: string; tune: string | null }[];
};

const KINDS = ["hymn", "scripture", "liturgy", "poem", "lyric"];
const n = (v: string) => (v.trim() ? parseInt(v, 10) : null);

export default function TextEditor(props: TextEditorProps) {
  const { text } = props;
  const router = useRouter();
  const db = supabaseBrowser();
  const [details, setDetails] = useState({ title: text.title, first_line: text.first_line ?? "", kind: text.kind ?? "", year: text.year?.toString() ?? "", period: text.period ?? "", notes: text.notes ?? "" });
  const [newTitle, setNewTitle] = useState({ title: "", kind: "transliteration" });
  const [src, setSrc] = useState({ corpus: "tanakh", book: "", chapter_start: "", verse_start: "", chapter_end: "", verse_end: "", citation: "", relation: "quoted" });
  const [status, setStatus] = useState<string | null>(null);

  async function run(work: () => PromiseLike<{ error: any } | void> | Promise<void>, done = "Saved") {
    setStatus("Saving…");
    try {
      const res = await work();
      if (res && (res as any).error) throw (res as any).error;
      setStatus(done);
      router.refresh();
    } catch (e: any) {
      setStatus(e?.message ?? "Couldn't save that.");
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <Link href="/song-editor/texts" className="text-xs font-medium uppercase tracking-wide text-teal-700 hover:underline">Texts</Link>
          <h1 className="text-xl font-semibold text-slate-900">{text.title}</h1>
        </div>
        {status && <span className="text-sm text-slate-500">{status}</span>}
      </div>

      <Section title="Details">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm text-slate-600">Title<input id="text-title" value={details.title} onChange={(e) => setDetails({ ...details, title: e.target.value })} className="input mt-1" /></label>
          <label className="text-sm text-slate-600">Kind
            <select id="text-kind" value={details.kind} onChange={(e) => setDetails({ ...details, kind: e.target.value })} className="input mt-1">
              <option value="">None</option>{KINDS.map((k) => <option key={k}>{k}</option>)}
            </select>
          </label>
          <label className="text-sm text-slate-600">Year written<input id="text-year" value={details.year} onChange={(e) => setDetails({ ...details, year: e.target.value })} inputMode="numeric" placeholder="1719" className="input mt-1" /></label>
          <label className="text-sm text-slate-600">Rough date (if no year)<input id="text-period" value={details.period} onChange={(e) => setDetails({ ...details, period: e.target.value })} placeholder="16th c." className="input mt-1" /></label>
          <label className="text-sm text-slate-600 sm:col-span-2">First line<input id="text-first-line" value={details.first_line} onChange={(e) => setDetails({ ...details, first_line: e.target.value })} className="input mt-1" /></label>
          <label className="text-sm text-slate-600 sm:col-span-2">Notes<textarea id="text-notes" value={details.notes} onChange={(e) => setDetails({ ...details, notes: e.target.value })} rows={3} className="input mt-1" /></label>
        </div>
        <button
          type="button"
          onClick={() => run(() => db.from("texts").update({ title: details.title.trim(), first_line: details.first_line.trim() || null, kind: details.kind || null, year: n(details.year), period: details.period.trim() || null, notes: details.notes.trim() || null }).eq("id", text.id))}
          className="rounded-full bg-amber-500 px-4 py-1.5 text-sm font-semibold text-white hover:bg-amber-400"
        >
          Save details
        </button>
      </Section>

      <Section title="Other titles">
        <div className="flex flex-wrap gap-1.5">
          {props.titles.length === 0 && <span className="text-sm text-slate-400">None yet</span>}
          {props.titles.map((t) => (
            <span key={t.id} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-sm text-slate-700">
              {t.title} <span className="text-slate-400">{t.kind}</span>
              <button type="button" aria-label={`Remove ${t.title}`} onClick={() => run(() => db.from("text_titles").delete().eq("id", t.id))} className="text-slate-400 hover:text-red-600">✕</button>
            </span>
          ))}
        </div>
        <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); if (!newTitle.title.trim()) return; run(() => db.from("text_titles").insert({ text_id: text.id, title: newTitle.title.trim(), kind: newTitle.kind })); setNewTitle({ ...newTitle, title: "" }); }}>
          <input id="text-new-title" value={newTitle.title} onChange={(e) => setNewTitle({ ...newTitle, title: e.target.value })} placeholder="L'cha Dodi" className="input max-w-xs" />
          <select value={newTitle.kind} onChange={(e) => setNewTitle({ ...newTitle, kind: e.target.value })} className="input w-auto">
            <option>transliteration</option><option>translation</option><option>alternate</option>
          </select>
          <button type="submit" className="rounded-full border border-slate-300 px-3 py-1 text-sm hover:bg-slate-50">Add</button>
        </form>
      </Section>

      <Section title="Writers">
        <CreditsEditor
          credits={props.credits}
          roles={["author", "translator", "adapter"]}
          people={props.people}
          onAdd={(name, role) => run(async () => {
            const person_id = await personIdFor(name, props.people);
            const { error } = await db.from("text_credits").insert({ text_id: text.id, person_id, role });
            if (error) throw error;
          })}
          onRemove={(c) => run(() => db.from("text_credits").delete().eq("text_id", text.id).eq("person_id", c.person_id).eq("role", c.role))}
        />
      </Section>

      <Section title="Tags">
        <TagsEditor label="Language, community, culture, occasion" options={props.tagOptions} selected={props.tagIds} onChange={(ids) => run(() => syncTags("text_tags", "text_id", text.id, props.tagIds, ids))} />
      </Section>

      <Section title="Sources">
        <ul className="space-y-1">
          {props.sources.length === 0 && <li className="text-sm text-slate-400">None yet</li>}
          {props.sources.map((s) => (
            <li key={s.id} className="flex items-center gap-2 text-sm text-slate-700">
              {formatScriptureRef(s)} <span className="text-slate-400">{s.relation}</span>
              <button type="button" aria-label="Remove source" onClick={() => run(() => db.from("text_sources").delete().eq("id", s.id))} className="text-slate-400 hover:text-red-600">✕</button>
            </li>
          ))}
        </ul>
        <form
          className="grid gap-2 sm:grid-cols-6"
          onSubmit={(e) => {
            e.preventDefault();
            const isScripture = ["tanakh", "new_testament", "apocrypha"].includes(src.corpus);
            if (isScripture ? !src.book.trim() : !src.citation.trim()) return;
            run(() => db.from("text_sources").insert({
              text_id: text.id, corpus: src.corpus, relation: src.relation,
              book: isScripture ? src.book.trim() : null,
              chapter_start: isScripture ? n(src.chapter_start) : null, verse_start: isScripture ? n(src.verse_start) : null,
              chapter_end: isScripture ? n(src.chapter_end) : null, verse_end: isScripture ? n(src.verse_end) : null,
              citation: isScripture ? null : src.citation.trim(),
            }));
          }}
        >
          <select value={src.corpus} onChange={(e) => setSrc({ ...src, corpus: e.target.value })} className="input sm:col-span-2">
            <option value="tanakh">Hebrew Bible</option><option value="new_testament">New Testament</option><option value="apocrypha">Apocrypha</option>
            <option value="quran">Quran</option><option value="liturgy">Liturgy</option><option value="other">Other</option>
          </select>
          {["tanakh", "new_testament", "apocrypha"].includes(src.corpus) ? (
            <>
              <input list="bible-books" value={src.book} onChange={(e) => setSrc({ ...src, book: e.target.value })} placeholder="Book" className="input sm:col-span-2" />
              <datalist id="bible-books">{[...TANAKH_BOOKS, ...NEW_TESTAMENT_BOOKS].map((b) => <option key={b} value={b} />)}</datalist>
              <input value={src.chapter_start} onChange={(e) => setSrc({ ...src, chapter_start: e.target.value })} placeholder="Chapter" inputMode="numeric" className="input" />
              <input value={src.verse_start} onChange={(e) => setSrc({ ...src, verse_start: e.target.value })} placeholder="Verse" inputMode="numeric" className="input" />
              <input value={src.chapter_end} onChange={(e) => setSrc({ ...src, chapter_end: e.target.value })} placeholder="to chapter" inputMode="numeric" className="input sm:col-start-3" />
              <input value={src.verse_end} onChange={(e) => setSrc({ ...src, verse_end: e.target.value })} placeholder="to verse" inputMode="numeric" className="input" />
            </>
          ) : (
            <input value={src.citation} onChange={(e) => setSrc({ ...src, citation: e.target.value })} placeholder="Citation, e.g. Masnavi I.1 or Kabbalat Shabbat" className="input sm:col-span-4" />
          )}
          <select value={src.relation} onChange={(e) => setSrc({ ...src, relation: e.target.value })} className="input sm:col-span-2">
            <option>quoted</option><option>paraphrase</option><option>metrical</option><option>inspired</option>
          </select>
          <button type="submit" className="rounded-full border border-slate-300 px-3 py-1 text-sm hover:bg-slate-50 sm:col-span-1">Add</button>
        </form>
        <p className="text-xs text-slate-400">Psalms use Hebrew numbering (Psalm 23, not 22).</p>
      </Section>

      <Section title="Songs with this text">
        <ul className="space-y-1">
          {props.songs.length === 0 && <li className="text-sm text-slate-400">No songs yet. Link one from the song editor.</li>}
          {props.songs.map((s) => (
            <li key={s.id} className="text-sm">
              <Link href={`/song-editor/songs/${s.slug ?? s.id}`} className="text-slate-700 hover:underline">{s.title}</Link>
              <span className="text-slate-400"> · {s.tune ?? "no tune linked"}</span>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
