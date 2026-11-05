"use client";

import { useState, useEffect, useMemo } from "react";
import {
  usePDF,
  Document,
  Page,
  View,
  Text,
  StyleSheet,
} from "@react-pdf/renderer";

export type PDFSong = {
  position: number;
  title: string;
  artist: string | null;
  key: string | null;
  tonality: string | null;
  songwriters: string[];
  leaders: string[];
};

type Field = "artist" | "key" | "tonality" | "songwriters" | "leader";
type Layout = "list" | "twoColumn";

const FIELD_LABELS: Record<Field, string> = {
  artist: "Artist",
  key: "Key",
  tonality: "Tonality",
  songwriters: "Songwriters",
  leader: "Leader",
};

// ── Page layout constants (A4 mm, used for preview page splitting) ─────────────

const PAGE_H = 297;
const MT = 20;
const MB = 15;
const MAX_Y = PAGE_H - MB;

// ── Preview scaling ────────────────────────────────────────────────────────────

function ps(fontSize: number) {
  const b = fontSize * 1.3;
  return { body: b, sub: b * 0.82, label: b * 0.72, num: b * 0.88, title: b * 1.9 };
}

// ── Page-break helpers ─────────────────────────────────────────────────────────

function listRowH(song: PDFSong, fields: Set<Field>, fs: number): number {
  return fs * 0.8 + 1
    + (fields.has("songwriters") && song.songwriters.length > 0 ? fs * 0.72 : 0)
    + (fields.has("leader") && song.leaders.length > 0 ? fs * 0.72 : 0);
}

function splitListPages(songs: PDFSong[], fields: Set<Field>, fs: number): PDFSong[][] {
  const firstStart = MT + fs * 2.5 + 2 + fs * 0.6;
  let y = firstStart;
  const pages: PDFSong[][] = [];
  let page: PDFSong[] = [];

  for (const song of songs) {
    const rh = listRowH(song, fields, fs);
    if (page.length > 0 && y + fs * 0.8 > MAX_Y) {
      pages.push(page);
      page = [];
      // MT+5 = col-header baseline, +2 for underline, +fs*0.6 for content gap, +rh+1 for first song advance
      y = MT + 8 + fs * 0.6 + rh;
    } else {
      y += rh + 1; // +1mm accounts for the separator line gap per row
    }
    page.push(song);
  }
  if (page.length > 0) pages.push(page);
  return pages.length ? pages : [[]];
}

function splitTwoColPages(songs: PDFSong[], fields: Set<Field>, fs: number): PDFSong[][] {
  const extraLines = (fields.has("tonality") ? 1 : 0) + (fields.has("songwriters") ? 1 : 0) + (fields.has("leader") ? 1 : 0);
  const entryH = fs * 1.8 + extraLines * fs * 0.85;
  const startY = MT + fs * 2.5;
  let col = 0, y = startY;
  const pages: PDFSong[][] = [];
  let page: PDFSong[] = [];

  for (const song of songs) {
    if (page.length > 0 && y + entryH > MAX_Y) {
      pages.push(page);
      page = [];
      col = 0;
      y = MT + 5;
    }
    page.push(song);
    col++;
    if (col > 1) { col = 0; y += entryH; }
  }
  if (page.length > 0) pages.push(page);
  return pages.length ? pages : [[]];
}

// ── Shared helper ──────────────────────────────────────────────────────────────

function cellKey(song: PDFSong, fields: Set<Field>): string {
  const k = fields.has("key") ? song.key : null;
  const t = fields.has("tonality") ? song.tonality : null;
  if (k && t) return `${k} ${t}`;
  return k ?? t ?? "";
}

// ── HTML preview components ────────────────────────────────────────────────────

type PageProps = {
  songs: PDFSong[];
  fields: Set<Field>;
  includeNumber: boolean;
  p: ReturnType<typeof ps>;
  pageIndex: number;
  totalPages: number;
  setName: string;
};

function PageCard({ children, pageIndex, totalPages }: { children: React.ReactNode; pageIndex: number; totalPages: number }) {
  return (
    <div className="page-card relative bg-white shadow-lg mb-6 last:mb-0" style={{ padding: "10% 8%" }}>
      {children}
      {totalPages > 1 && (
        <p className="absolute bottom-5 right-8 text-zinc-300 tabular-nums select-none" style={{ fontSize: 10 }}>
          {pageIndex + 1} / {totalPages}
        </p>
      )}
    </div>
  );
}

function DocHeader({ setName, p }: { setName: string; p: ReturnType<typeof ps> }) {
  return (
    <div className="mb-6 pb-4 border-b border-zinc-200">
      <h2 className="font-bold text-zinc-900 leading-tight" style={{ fontSize: p.title }}>{setName}</h2>
    </div>
  );
}

function ListColHeaders({ fields, includeNumber, showKey, keyColLabel, p }: {
  fields: Set<Field>; includeNumber: boolean; showKey: boolean; keyColLabel: string; p: ReturnType<typeof ps>;
}) {
  return (
    <div className="flex gap-2 font-semibold uppercase text-zinc-400 border-b border-zinc-200 pb-1.5 mb-1" style={{ fontSize: p.label }}>
      {includeNumber && <span className="w-5 shrink-0">#</span>}
      <span className="flex-1">Title</span>
      {fields.has("artist") && <span className="w-36 shrink-0">Artist</span>}
      {showKey && <span className="w-24 shrink-0">{keyColLabel}</span>}
    </div>
  );
}

function ListPageCard({ songs, fields, includeNumber, p, pageIndex, totalPages, setName }: PageProps) {
  const showKey = fields.has("key") || fields.has("tonality");
  const keyColLabel = fields.has("key") && fields.has("tonality") ? "Key / Tonality"
    : fields.has("key") ? "Key" : "Tonality";

  return (
    <PageCard pageIndex={pageIndex} totalPages={totalPages}>
      {pageIndex === 0 && <DocHeader setName={setName} p={p} />}
      <ListColHeaders fields={fields} includeNumber={includeNumber} showKey={showKey} keyColLabel={keyColLabel} p={p} />
      <div style={{ fontSize: p.body }}>
        {songs.map((song) => (
          <div key={song.position} className="py-1.5 border-b border-zinc-100 last:border-0">
            <div className="flex gap-2 items-baseline">
              {includeNumber && (
                <span className="w-5 shrink-0 font-bold text-zinc-400" style={{ fontSize: p.num }}>{song.position}</span>
              )}
              <span className="flex-1 font-semibold text-zinc-900 truncate">{song.title}</span>
              {fields.has("artist") && (
                <span className="w-36 shrink-0 text-zinc-500 truncate" style={{ fontSize: p.sub }}>{song.artist ?? ""}</span>
              )}
              {showKey && (
                <span className="w-24 shrink-0 font-bold text-zinc-700">{cellKey(song, fields)}</span>
              )}
            </div>
            {fields.has("songwriters") && song.songwriters.length > 0 && (
              <div className="flex gap-2 mt-0.5">
                {includeNumber && <span className="w-5 shrink-0" />}
                <span className="italic text-zinc-400" style={{ fontSize: p.sub }}>({song.songwriters.join(", ")})</span>
              </div>
            )}
            {fields.has("leader") && song.leaders.length > 0 && (
              <div className="flex gap-2 mt-0.5">
                {includeNumber && <span className="w-5 shrink-0" />}
                <span className="font-semibold text-zinc-500" style={{ fontSize: p.sub }}>Leader: {song.leaders.join(", ")}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </PageCard>
  );
}

function columnFirstOrder(songs: PDFSong[]): PDFSong[] {
  const half = Math.ceil(songs.length / 2);
  const result: PDFSong[] = [];
  for (let i = 0; i < half; i++) {
    result.push(songs[i]);
    if (songs[half + i]) result.push(songs[half + i]);
  }
  return result;
}

function TwoColPageCard({ songs, fields, includeNumber, p, pageIndex, totalPages, setName }: PageProps) {
  const ordered = columnFirstOrder(songs);
  return (
    <PageCard pageIndex={pageIndex} totalPages={totalPages}>
      {pageIndex === 0 && <DocHeader setName={setName} p={p} />}
      <div className="grid grid-cols-2 gap-3" style={{ fontSize: p.body }}>
        {ordered.map((song) => (
          <div key={song.position} className="border border-zinc-200 rounded-lg p-3 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-baseline gap-1 min-w-0">
                {includeNumber && (
                  <span className="font-bold text-zinc-400 shrink-0" style={{ fontSize: p.num }}>{song.position}.</span>
                )}
                <span className="font-semibold text-zinc-900 leading-snug">{song.title}</span>
              </div>
              {fields.has("key") && song.key && (
                <span className="font-bold text-zinc-800 shrink-0 ml-1">{song.key}</span>
              )}
            </div>
            {fields.has("songwriters") && song.songwriters.length > 0 && (
              <p className="italic text-zinc-400 mt-0.5 truncate" style={{ fontSize: p.sub }}>({song.songwriters.join(", ")})</p>
            )}
            {fields.has("artist") && song.artist && (
              <p className="text-zinc-500 mt-0.5 truncate" style={{ fontSize: p.sub }}>{song.artist}</p>
            )}
            {fields.has("tonality") && song.tonality && (
              <p className="text-zinc-400 mt-0.5" style={{ fontSize: p.sub }}>{song.tonality}</p>
            )}
            {fields.has("leader") && song.leaders.length > 0 && (
              <p className="font-semibold text-zinc-500 mt-0.5 truncate" style={{ fontSize: p.sub }}>Leader: {song.leaders.join(", ")}</p>
            )}
          </div>
        ))}
      </div>
    </PageCard>
  );
}

// ── react-pdf document (used for download and print) ──────────────────────────

// react-pdf has no text-overflow; truncate strings to fit fixed-width columns.
function pdfTrunc(text: string | null | undefined, colPt: number, fontSizePt: number): string {
  if (!text) return "";
  const maxChars = Math.max(6, Math.round(colPt / (fontSizePt * 0.52)));
  return text.length > maxChars ? text.slice(0, maxChars - 1) + "…" : text;
}

const MM = 2.835;

function SetListDoc({
  setName,
  songs,
  fields,
  includeNumber,
  layout,
  fontSize,
}: {
  setName: string;
  songs: PDFSong[];
  fields: Set<Field>;
  includeNumber: boolean;
  layout: Layout;
  fontSize: number;
}) {
  const fs = fontSize;
  const showKey = fields.has("key") || fields.has("tonality");
  const showArtist = fields.has("artist");
  const showSW = fields.has("songwriters");
  const showLeader = fields.has("leader");
  const keyLabel = fields.has("key") && fields.has("tonality") ? "Key / Tonality"
    : fields.has("key") ? "Key" : "Tonality";

  // Mirror the ps() scaling used by the HTML preview so the PDF matches.
  const body = fs * 1.3;
  const sub = body * 0.82;
  const lbl = body * 0.72;
  const num = body * 0.88;
  const titleFs = body * 1.9;

  // Tailwind spacing in px maps 1:1 to pt numbers, so gap-2=8, gap-3=12, py-1.5=6, p-3=12, etc.
  const s = StyleSheet.create({
    page: { paddingTop: 20 * MM, paddingBottom: 15 * MM, paddingHorizontal: 15 * MM, fontFamily: "Helvetica" },
    // DocHeader: pb-4 border-b border-zinc-200 mb-6
    header: { paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: "#e4e4e7", marginBottom: 24 },
    title: { fontSize: titleFs, fontFamily: "Helvetica-Bold" },
    // ListColHeaders: gap-2 pb-1.5 border-b border-zinc-200 mb-1
    colRow: { flexDirection: "row", gap: 8, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: "#e4e4e7", marginBottom: 4 },
    colLabel: { fontSize: lbl, fontFamily: "Helvetica-Bold", color: "#888888" },
    // Song rows: py-1.5 border-b border-zinc-100
    songRow: { flexDirection: "column", paddingTop: 6, paddingBottom: 6, borderBottomWidth: 0.5, borderBottomColor: "#f4f4f5" },
    songMain: { flexDirection: "row", gap: 8 },
    numText: { width: 16, fontSize: num, fontFamily: "Helvetica-Bold", color: "#aaaaaa" },
    titleText: { flex: 1, fontSize: body, fontFamily: "Helvetica-Bold" },
    artistText: { width: 110, fontSize: sub, color: "#555555" },
    keyText: { width: 72, fontSize: body, fontFamily: "Helvetica-Bold" },
    swText: { fontSize: sub, fontFamily: "Helvetica-Oblique", color: "#999999", marginTop: 2 },
    leaderText: { fontSize: sub, fontFamily: "Helvetica-Bold", color: "#666666", marginTop: 2 },
    // Two-column cards: gap-3=12 between rows/cols, p-3=12 card padding
    cardRow: { flexDirection: "row", marginBottom: 12 },
    cardSpacer: { width: 12 },
    card: { flex: 1, borderWidth: 0.5, borderColor: "#e4e4e7", borderRadius: 4, padding: 12 },
    cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 8 },
    cardTitleRow: { flexDirection: "row", alignItems: "baseline", gap: 4, flex: 1 },
    cardNum: { fontSize: num, fontFamily: "Helvetica-Bold", color: "#aaaaaa" },
    cardTitle: { flex: 1, fontSize: body, fontFamily: "Helvetica-Bold" },
    cardKey: { fontSize: body, fontFamily: "Helvetica-Bold" },
    cardSub: { fontSize: sub, color: "#666666", marginTop: 2 },
    cardSW: { fontSize: sub, fontFamily: "Helvetica-Oblique", color: "#999999", marginTop: 2 },
    cardTonality: { fontSize: sub, color: "#aaaaaa", marginTop: 2 },
    cardLeader: { fontSize: sub, fontFamily: "Helvetica-Bold", color: "#666666", marginTop: 2 },
    pageNum: { fontSize: lbl, color: "#cccccc", textAlign: "right" },
  });

  const half = Math.ceil(songs.length / 2);
  const pairs: [PDFSong, PDFSong | null][] = Array.from({ length: half }, (_, i) => [songs[i], songs[half + i] ?? null]);

  function CardView({ song }: { song: PDFSong }) {
    return (
      <View style={s.card}>
        <View style={s.cardHead}>
          <View style={s.cardTitleRow}>
            {includeNumber && <Text style={s.cardNum}>{song.position}.</Text>}
            <Text style={s.cardTitle}>{song.title}</Text>
          </View>
          {fields.has("key") && song.key && <Text style={s.cardKey}>{song.key}</Text>}
        </View>
        {showSW && song.songwriters.length > 0 && <Text style={s.cardSW}>({song.songwriters.join(", ")})</Text>}
        {showArtist && song.artist && <Text style={s.cardSub}>{song.artist}</Text>}
        {fields.has("tonality") && song.tonality && <Text style={s.cardTonality}>{song.tonality}</Text>}
        {showLeader && song.leaders.length > 0 && <Text style={s.cardLeader}>Leader: {song.leaders.join(", ")}</Text>}
      </View>
    );
  }

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* Matches DocHeader: pb-4 border-b mb-6 */}
        <View style={s.header}>
          <Text style={s.title}>{setName}</Text>
        </View>

        {layout === "list" ? (
          <>
            {/* Matches ListColHeaders: gap-2 pb-1.5 border-b mb-1 */}
            <View style={s.colRow}>
              {includeNumber && <Text style={{ ...s.colLabel, width: 16 }}>#</Text>}
              <Text style={{ ...s.colLabel, flex: 1 }}>Title</Text>
              {showArtist && <Text style={{ ...s.colLabel, width: 110 }}>Artist</Text>}
              {showKey && <Text style={{ ...s.colLabel, width: 72 }}>{keyLabel}</Text>}
            </View>
            {songs.map((song) => (
              <View key={song.position} style={s.songRow} wrap={false}>
                <View style={s.songMain}>
                  {includeNumber && <Text style={s.numText}>{song.position}</Text>}
                  <Text style={s.titleText}>{pdfTrunc(song.title, 290, body)}</Text>
                  {showArtist && <Text style={s.artistText}>{pdfTrunc(song.artist, 110, sub)}</Text>}
                  {showKey && <Text style={s.keyText}>{cellKey(song, fields)}</Text>}
                </View>
                {showSW && song.songwriters.length > 0 && (
                  <Text style={{ ...s.swText, marginLeft: includeNumber ? 24 : 0 }}>
                    ({song.songwriters.join(", ")})
                  </Text>
                )}
                {showLeader && song.leaders.length > 0 && (
                  <Text style={{ ...s.leaderText, marginLeft: includeNumber ? 24 : 0 }}>
                    Leader: {song.leaders.join(", ")}
                  </Text>
                )}
              </View>
            ))}
          </>
        ) : (
          <>
            {pairs.map(([a, b], i) => (
              <View key={i} style={s.cardRow} wrap={false}>
                <CardView song={a} />
                <View style={s.cardSpacer} />
                {b ? <CardView song={b} /> : <View style={{ flex: 1 }} />}
              </View>
            ))}
          </>
        )}

        <Text
          style={s.pageNum}
          render={({ pageNumber, totalPages }) => totalPages > 1 ? `${pageNumber} / ${totalPages}` : ""}
          fixed
        />
      </Page>
    </Document>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function PDFBuilder({ setName, songs }: { setName: string; songs: PDFSong[] }) {
  const [fields, setFields] = useState<Set<Field>>(new Set(["artist", "key"]));
  const [layout, setLayout] = useState<Layout>("list");
  const [includeNumber, setIncludeNumber] = useState(true);
  const [fontSize, setFontSize] = useState(10);

  function toggleField(f: Field) {
    setFields((prev) => {
      const next = new Set(prev);
      if (next.has(f)) next.delete(f); else next.add(f);
      return next;
    });
  }

  // Debounced settings for PDF generation — keeps the background PDF in sync
  // without regenerating on every keystroke or rapid toggle.
  const [docFields, setDocFields] = useState(fields);
  const [docLayout, setDocLayout] = useState(layout);
  const [docIncludeNumber, setDocIncludeNumber] = useState(includeNumber);
  const [docFontSize, setDocFontSize] = useState(fontSize);

  useEffect(() => {
    const t = setTimeout(() => {
      setDocFields(fields);
      setDocLayout(layout);
      setDocIncludeNumber(includeNumber);
      setDocFontSize(fontSize);
    }, 300);
    return () => clearTimeout(t);
  }, [fields, layout, includeNumber, fontSize]);

  const doc = useMemo(
    () => (
      <SetListDoc
        setName={setName}
        songs={songs}
        fields={docFields}
        includeNumber={docIncludeNumber}
        layout={docLayout}
        fontSize={docFontSize}
      />
    ),
    [setName, songs, docFields, docLayout, docIncludeNumber, docFontSize],
  );

  const [pdfInstance, updatePDF] = usePDF({ document: doc });

  useEffect(() => {
    updatePDF(doc);
  }, [doc]);

  const pages = layout === "list"
    ? splitListPages(songs, fields, fontSize)
    : splitTwoColPages(songs, fields, fontSize);

  const p = ps(fontSize);
  const commonProps = { fields, includeNumber, p, totalPages: pages.length, setName };

  return (
    <div className="flex h-screen bg-zinc-200 overflow-hidden">
      {/* Preview */}
      <main className="flex-1 overflow-y-auto p-10">
        {pages.map((pageSongs, i) =>
          layout === "list" ? (
            <ListPageCard key={i} songs={pageSongs} pageIndex={i} {...commonProps} />
          ) : (
            <TwoColPageCard key={i} songs={pageSongs} pageIndex={i} {...commonProps} />
          )
        )}
      </main>

      {/* Options panel */}
      <aside className="w-64 shrink-0 bg-white border-l border-zinc-200 flex flex-col">
        <div className="p-5 border-b border-zinc-100">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">PDF Builder</p>
          <h1 className="text-sm font-semibold text-zinc-900 truncate">{setName}</h1>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 mb-3">Include</p>
            <div className="space-y-3">
              <label className="flex items-center justify-between text-sm text-zinc-700 cursor-pointer select-none">
                <span>Song number</span>
                <input type="checkbox" checked={includeNumber} onChange={(e) => setIncludeNumber(e.target.checked)} className="rounded accent-amber-500" />
              </label>
              {(Object.keys(FIELD_LABELS) as Field[]).map((f) => (
                <label key={f} className="flex items-center justify-between text-sm text-zinc-700 cursor-pointer select-none">
                  <span>{FIELD_LABELS[f]}</span>
                  <input type="checkbox" checked={fields.has(f)} onChange={() => toggleField(f)} className="rounded accent-amber-500" />
                </label>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 mb-3">Layout</p>
            <div className="space-y-2">
              {([["list", "List"], ["twoColumn", "Two columns"]] as const).map(([value, label]) => (
                <label key={value} className="flex items-center justify-between text-sm text-zinc-700 cursor-pointer select-none">
                  <span>{label}</span>
                  <input type="radio" name="layout" value={value} checked={layout === value} onChange={() => setLayout(value)} className="accent-amber-500" />
                </label>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 mb-3">Font size</p>
            <div className="flex items-center justify-between">
              <button
                onClick={() => setFontSize((f) => Math.max(8, f - 1))}
                disabled={fontSize <= 8}
                className="px-3 py-1.5 rounded border border-zinc-300 text-sm font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-30 transition-colors"
              >−1</button>
              <span className="text-sm font-semibold text-zinc-700 tabular-nums">{fontSize}pt</span>
              <button
                onClick={() => setFontSize((f) => Math.min(14, f + 1))}
                disabled={fontSize >= 14}
                className="px-3 py-1.5 rounded border border-zinc-300 text-sm font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-30 transition-colors"
              >+1</button>
            </div>
          </div>
        </div>

        <div className="p-5 border-t border-zinc-100 space-y-2">
          <a
            href={pdfInstance.url ?? "#"}
            download={`${setName}.pdf`}
            onClick={(e) => { if (!pdfInstance.url) e.preventDefault(); }}
            className={`w-full flex items-center justify-center gap-2 rounded-full bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors ${pdfInstance.url && !pdfInstance.loading ? "hover:bg-amber-400" : "opacity-50 pointer-events-none"}`}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            {pdfInstance.loading ? "Generating…" : "Download PDF"}
          </a>
          <button
            onClick={() => {
              if (!pdfInstance.url) return;
              const win = window.open(pdfInstance.url);
              win?.addEventListener("load", () => win.print());
            }}
            disabled={!pdfInstance.url || pdfInstance.loading}
            className="w-full flex items-center justify-center gap-2 rounded-full border border-zinc-300 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-30 transition-colors"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
              <path d="M6 9V3h12v6" /><rect x="6" y="14" width="12" height="8" rx="1" />
            </svg>
            Print
          </button>
        </div>
      </aside>
    </div>
  );
}
