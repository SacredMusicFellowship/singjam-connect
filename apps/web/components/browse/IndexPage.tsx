import Link from "next/link";
import { loadBrowseIndex } from "@singjam/core";
import { supabaseAnon } from "@/lib/supabase/anon";

const letterOf = (label: string) => {
  const c = label.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/^the\s+/i, "").charAt(0).toUpperCase();
  return /[A-Z]/.test(c) ? c : "#";
};

// Every songwriter or recording artist with songs, A–Z by first letter.
export default async function IndexPage({ kind, title }: { kind: "person" | "artist"; title: string }) {
  const chips = await loadBrowseIndex(supabaseAnon(), kind);
  const groups = new Map<string, typeof chips>();
  for (const c of chips) groups.set(letterOf(c.label), [...(groups.get(letterOf(c.label)) ?? []), c]);
  const letters = [...groups.keys()].sort((a, b) => (a === "#" ? 1 : b === "#" ? -1 : a < b ? -1 : 1));
  return (
    <div className="space-y-6 pb-16">
      <div className="space-y-1">
        <Link href="/browse" className="text-xs font-medium uppercase tracking-wide text-amber-700 hover:underline">Browse</Link>
        <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
        <p className="text-sm text-slate-500">{chips.length} with songs on SingJam. Numbers are songs.</p>
      </div>
      <nav aria-label="Jump to letter" className="flex flex-wrap gap-1">
        {letters.map((l) => (
          <a key={l} href={`#letter-${l}`} className="rounded px-2 py-0.5 text-sm font-medium text-amber-700 hover:bg-amber-50">{l}</a>
        ))}
      </nav>
      {letters.map((l) => (
        <section key={l} id={`letter-${l}`} className="scroll-mt-20 space-y-1.5">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{l}</h2>
          <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
            {groups.get(l)!.map((c) => (
              <li key={c.href}>
                <Link href={c.href} className="text-sm text-slate-700 hover:text-amber-700 hover:underline">
                  {c.label} <span className="tabular-nums text-slate-400">{c.count}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
