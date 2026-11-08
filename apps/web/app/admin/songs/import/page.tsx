"use client";

import { useRef, useState } from "react";
import { importRowBody, parseImportCsv, type ImportRow } from "@/lib/songImportCsv";

type RowResult =
  | { status: "pending" }
  | { status: "running" }
  | { status: "skipped"; reason: string }
  | { status: "added"; detail: string }
  | { status: "error"; reason: string };

export default function ImportCSVPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [results, setResults] = useState<RowResult[]>([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const parsed = parseImportCsv(ev.target?.result as string);
      setRows(parsed);
      setResults(parsed.map(() => ({ status: "pending" })));
      setProgress(0);
    };
    reader.readAsText(file);
  }

  // Each row goes through the same path as a user adding a song: Spotify match,
  // the same-song duplicate check, "added by" recorded, then background
  // enrichment (about 4¢ a song).
  async function runImport() {
    setRunning(true);
    const current: RowResult[] = rows.map(() => ({ status: "pending" }));
    setResults([...current]);

    for (let i = 0; i < rows.length; i++) {
      current[i] = { status: "running" };
      setResults([...current]);
      try {
        const res = await fetch("/api/songs/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(importRowBody(rows[i])),
        });
        const json = await res.json().catch(() => ({}));
        current[i] =
          res.status === 409
            ? { status: "skipped", reason: "Already in the library" }
            : res.ok
              ? { status: "added", detail: "added — details fill in within a minute" }
              : { status: "error", reason: json.error ?? `HTTP ${res.status}` };
      } catch (err: any) {
        current[i] = { status: "error", reason: err?.message ?? "Unknown error" };
      }
      setResults([...current]);
      setProgress(i + 1);
    }

    setRunning(false);
  }

  const statusCounts = results.reduce(
    (acc, r) => { acc[r.status] = (acc[r.status] ?? 0) + 1; return acc; },
    {} as Record<string, number>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Import songs from CSV</h1>
        <p className="mt-1 text-sm text-slate-500">
          CSV should have <code className="rounded bg-slate-100 px-1">title</code> and{" "}
          <code className="rounded bg-slate-100 px-1">artist</code> columns, and may add{" "}
          <code className="rounded bg-slate-100 px-1">writers</code> (separated by ;) and{" "}
          <code className="rounded bg-slate-100 px-1">tags</code> (<code className="rounded bg-slate-100 px-1">form:Shanty; occasion:Pub sing</code>). A row with writers and no artist is added without a recording. Everything left blank fills in automatically.
        </p>
      </div>

      <div className="flex items-center gap-4">
        <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleFile} className="text-sm text-slate-600" />
        {rows.length > 0 && !running && (
          <button
            onClick={runImport}
            className="rounded-full bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-400"
          >
            Import {rows.length} songs
          </button>
        )}
      </div>

      {rows.length > 0 && (
        <>
          {running && (
            <div className="space-y-1">
              <div className="text-sm text-slate-500">{progress} / {rows.length} processed</div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-2 rounded-full bg-amber-500 transition-all"
                  style={{ width: `${(progress / rows.length) * 100}%` }}
                />
              </div>
            </div>
          )}

          {!running && progress > 0 && (
            <div className="flex gap-4 text-sm">
              {statusCounts.added && <span className="text-emerald-600">✓ {statusCounts.added} added</span>}
              {statusCounts.skipped && <span className="text-slate-400">↷ {statusCounts.skipped} skipped</span>}
              {statusCounts.error && <span className="text-red-500">✗ {statusCounts.error} errors</span>}
            </div>
          )}

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Title</th>
                  <th className="px-4 py-2 text-left font-medium">Artist</th>
                  <th className="px-4 py-2 text-left font-medium">Writers</th>
                  <th className="px-4 py-2 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row, i) => {
                  const result = results[i];
                  return (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="px-4 py-2 font-medium text-slate-800">{row.title}</td>
                      <td className="px-4 py-2 text-slate-500">{row.artist}</td>
                      <td className="px-4 py-2 text-slate-500">{row.writers}</td>
                      <td className="px-4 py-2">
                        {result?.status === "pending" && <span className="text-slate-300">—</span>}
                        {result?.status === "running" && <span className="text-amber-500">Looking up…</span>}
                        {result?.status === "added" && (
                          <span className="text-emerald-600">✓ Added{result.detail ? ` · ${result.detail}` : ""}</span>
                        )}
                        {result?.status === "skipped" && (
                          <span className="text-slate-400">↷ {result.reason}</span>
                        )}
                        {result?.status === "error" && (
                          <span className="text-red-500">✗ {result.reason}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
