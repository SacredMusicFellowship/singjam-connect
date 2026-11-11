"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchAllRows } from "@singjam/core";
import { supabaseBrowser } from "@/lib/supabase/client";

const DAY = 24 * 60 * 60 * 1000;

// What automatic fill-ins and "Suggest improvements" cost over the last day,
// from the runs recorded in migration 214 (admins only).
export default function EnrichmentSpend({ refreshKey = 0 }: { refreshKey?: number }) {
  const [spend, setSpend] = useState<{ runs: number; songs: number; usd: number } | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const since = new Date(Date.now() - DAY).toISOString();
      const rows = await fetchAllRows<{ id: string; song_id: string | null; cost_usd: number }>((f, t) =>
        supabaseBrowser().from("song_enrichment_runs").select("id, song_id, cost_usd").gte("ran_at", since).order("ran_at").order("id").range(f, t)
      );
      setSpend({ runs: rows.length, songs: new Set(rows.map((r) => r.song_id)).size, usd: rows.reduce((sum, r) => sum + Number(r.cost_usd), 0) });
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => { void load(); }, [load, refreshKey]);

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-600">
      <span className="font-medium text-slate-700">Fill-in spend, last 24 hours:</span>
      {failed ? (
        <span className="text-red-600">couldn&apos;t load</span>
      ) : !spend ? (
        <span className="h-4 w-40 animate-pulse rounded bg-slate-100" />
      ) : (
        <span>
          ${spend.usd.toFixed(2)} across {spend.runs} run{spend.runs === 1 ? "" : "s"}
          {spend.runs > 0 && <> · {((spend.usd / spend.runs) * 100).toFixed(1)}¢ each</>}
        </span>
      )}
      <button type="button" onClick={() => void load()} className="ml-auto rounded-full px-3 py-0.5 text-xs font-medium text-amber-700 hover:bg-amber-50">
        Refresh
      </button>
    </div>
  );
}
