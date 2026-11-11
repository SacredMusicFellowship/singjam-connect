"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

// "New text" / "New tune": creates the row and opens its edit page.
export default function CreateCatalogRow({ table, label, placeholder }: { table: "texts" | "tunes"; label: string; placeholder: string }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const v = value.trim();
    if (table === "texts" && !v) return;
    setBusy(true);
    setError(null);
    const row = table === "texts" ? { title: v, slug: "x" } : { name: v || null, slug: "x" };
    const { data, error } = await supabaseBrowser().from(table).insert(row).select("slug").single();
    setBusy(false);
    if (error || !data) { setError(error?.message ?? "Couldn't create it."); return; }
    router.push(`/song-editor/${table}/${data.slug}`);
  }

  return (
    <form onSubmit={create} className="flex flex-wrap items-center gap-2">
      <input id={`new-${table}`} value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} className="input max-w-sm" />
      <button type="submit" disabled={busy || (table === "texts" && !value.trim())} className="rounded-full bg-amber-500 px-4 py-1.5 text-sm font-semibold text-white hover:bg-amber-400 disabled:opacity-50">
        {busy ? "Creating…" : label}
      </button>
      {error && <p className="w-full text-sm text-red-600">{error}</p>}
    </form>
  );
}
