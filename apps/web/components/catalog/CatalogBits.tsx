"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import TagCombobox from "@/components/TagCombobox";

export type Person = { id: string; name: string };
export type Credit = { person_id: string; name: string; role: string };

// Writers of a text or tune, each with a role; a new name becomes a person.
export function CreditsEditor({ credits, roles, people, onAdd, onRemove }: {
  credits: Credit[];
  roles: string[];
  people: Person[];
  onAdd: (name: string, role: string) => Promise<void>;
  onRemove: (c: Credit) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [role, setRole] = useState(roles[0]);
  const listId = `people-${roles.join("-")}`;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {credits.length === 0 && <span className="text-sm text-slate-400">None yet</span>}
        {credits.map((c) => (
          <span key={`${c.person_id}-${c.role}`} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-sm text-slate-700">
            {c.name} <span className="text-slate-400">{c.role}</span>
            <button type="button" onClick={() => onRemove(c)} aria-label={`Remove ${c.name}`} className="text-slate-400 hover:text-red-600">✕</button>
          </span>
        ))}
      </div>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={async (e) => { e.preventDefault(); if (!name.trim()) return; await onAdd(name.trim(), role); setName(""); }}
      >
        <input list={listId} value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="input max-w-xs" />
        <datalist id={listId}>{people.map((p) => <option key={p.id} value={p.name} />)}</datalist>
        <select value={role} onChange={(e) => setRole(e.target.value)} className="input w-auto">{roles.map((r) => <option key={r}>{r}</option>)}</select>
        <button type="submit" className="rounded-full border border-slate-300 px-3 py-1 text-sm hover:bg-slate-50">Add</button>
      </form>
    </div>
  );
}

// Tags on a text or tune (language, community, mode…), saved as they change.
export function TagsEditor({ label, options, selected, onChange }: {
  label: string;
  options: { id: string; name: string; type: string }[];
  selected: string[];
  onChange: (ids: string[]) => Promise<void>;
}) {
  const typeLabel = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
  return (
    <TagCombobox
      label={label}
      options={options.map((o) => ({ id: o.id, name: `${o.name} · ${typeLabel(o.type)}` }))}
      selected={selected}
      onChange={(ids) => { void onChange(ids); }}
      placeholder="Search tags…"
      optional
    />
  );
}

// One save at a time with its outcome shown ("Saving…", "Saved" or the
// error), then the page's data reloads.
export function useCatalogSave() {
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);
  const run = useCallback(async (work: () => PromiseLike<{ error: any } | void> | Promise<void>, done = "Saved") => {
    setStatus("Saving…");
    try {
      const res = await work();
      if (res && (res as any).error) throw (res as any).error;
      setStatus(done);
      router.refresh();
    } catch (e: any) {
      setStatus(e?.message ?? "Couldn't save that.");
    }
  }, [router]);
  return { status, run };
}

// How exact a text's or tune's year is (core formatYear shows it).
export function YearPrecisionField({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="text-sm text-slate-600">How exact (any year in a decade or century)
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className="input mt-1">
        <option value="exact">Exact year</option><option value="circa">About (c.)</option><option value="decade">That decade</option><option value="century">That century</option>
      </select>
    </label>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
      {children}
    </section>
  );
}
