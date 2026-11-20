"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { KNOWN_AS, type KnownAs } from "@singjam/core";

type Match = {
  title: string;
  artist: string | null;
  spotify_url: string | null;
  release_year: number | null;
  youtube_id: string | null;
  youtube_official: boolean;
  existing: { id: string; slug: string | null; title: string; display_artist: string | null; match: "same" | "possible" } | null;
};

type Step =
  | { type: "input" }
  | { type: "looking-up" }
  | { type: "preview"; match: Match }
  | { type: "submitting" };

function spotifyTrackId(url: string | null): string | null {
  if (!url) return null;
  return url.match(/\/track\/([a-zA-Z0-9]+)/)?.[1] ?? null;
}

// With `onAdded` (a set's Add songs), the form starts open and hands back the
// song it added, or the one already in the library, instead of opening it.
// `setId` lets enrichment use that set's jam tags as context.
export type AddedSong = { id: string; title: string; display_artist: string | null };

export default function SubmitSongForm({ defaultTitle = "", onAdded, onCancel, setId }: {
  defaultTitle?: string;
  setId?: string;
  onAdded?: (song: AddedSong) => void;
  onCancel?: () => void;
} = {}) {
  const router = useRouter();
  const [open, setOpen] = useState(!!onAdded);
  const [title, setTitle] = useState(defaultTitle);
  const [artist, setArtist] = useState("");
  const [knownAs, setKnownAs] = useState<KnownAs | null>(null);
  const [firstLine, setFirstLine] = useState("");
  const [step, setStep] = useState<Step>({ type: "input" });
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setStep({ type: "input" });
    setError(null);
  }

  const typed = (): Match => ({
    title: title.trim(), artist: artist.trim() || null, spotify_url: null, release_year: null, youtube_id: null, youtube_official: false, existing: null,
  });

  async function lookup() {
    if (!title.trim()) return;
    setError(null);
    setStep({ type: "looking-up" });
    const params = new URLSearchParams({ title: title.trim() });
    if (artist.trim()) params.set("artist", artist.trim());
    try {
      const res = await fetch(`/api/songs/lookup?${params}`);
      setStep({ type: "preview", match: res.ok ? await res.json() : typed() });
    } catch {
      setStep({ type: "preview", match: typed() });
    }
  }

  async function submit(match: Match, addAnyway = false) {
    setError(null);
    setStep({ type: "submitting" });
    const res = await fetch("/api/songs/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...match, confirmed: true, add_anyway: addAnyway,
        known_as: knownAs, first_line_hint: firstLine.trim() || null, set_id: setId ?? null,
      }),
    });
    const json = await res.json();
    if (onAdded && (res.ok || (res.status === 409 && json.id))) {
      const existing = res.ok ? null : match.existing;
      onAdded({ id: json.id, title: existing?.title ?? match.title, display_artist: existing ? existing.display_artist : match.artist });
      return;
    }
    if (res.status === 409) {
      setError("This song is already in our library.");
      setStep({ type: "preview", match });
      if (json.slug) setTimeout(() => router.push(`/songs/${json.slug}`), 1500);
      return;
    }
    if (!res.ok) {
      setError(json.error ?? "Something went wrong. Please try again.");
      setStep({ type: "preview", match });
      return;
    }
    router.push(`/songs/${json.slug}`);
  }

  if (!open) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-5 py-4 text-center">
        <p className="text-sm text-zinc-500">Can't find your song?</p>
        <button
          onClick={() => setOpen(true)}
          className="mt-2 rounded-full bg-zinc-800 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700 transition-colors"
        >
          Add a missing song
        </button>
      </div>
    );
  }

  const isInput = step.type === "input";
  const isLookingUp = step.type === "looking-up";
  const isPreview = step.type === "preview";
  const isSubmitting = step.type === "submitting";
  const busy = isLookingUp || isSubmitting;

  return (
    // In a set's Add songs it sits inside that panel, so it draws no box of its own.
    <div className={onAdded ? "space-y-4 pt-2" : "rounded-2xl border border-zinc-200 bg-white p-5 space-y-4"}>
      <div>
        <h2 className="text-base font-semibold">Add a missing song</h2>
        <p className="mt-0.5 text-xs text-zinc-500">
          {onAdded
            ? "We'll look it up, add it to the library and put it in this set."
            : "We'll look it up and add it to the library. It'll be available for you to add to your repertoire straight away."}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1">
            Song title <span className="text-red-500">*</span>
          </label>
          <input
            value={title}
            onChange={(e) => { setTitle(e.target.value); reset(); }}
            disabled={busy}
            placeholder="e.g. Proud Mary"
            className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent disabled:opacity-50"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1">Recording artist</label>
          <input
            value={artist}
            onChange={(e) => { setArtist(e.target.value); reset(); }}
            disabled={busy}
            placeholder="e.g. Creedence Clearwater Revival"
            className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent disabled:opacity-50"
          />
        </div>
      </div>

      {isLookingUp && <p className="text-xs text-zinc-400">Looking it up…</p>}

      {isSubmitting && <p className="text-xs text-zinc-400">Adding it to the library…</p>}

      {step.type === "preview" && <MatchPreview match={step.match} />}

      {step.type === "preview" && step.match.existing?.match !== "same" && (
        <AddHints knownAs={knownAs} onKnownAs={setKnownAs} firstLine={firstLine} onFirstLine={setFirstLine} />
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex flex-wrap gap-3">
        {(isInput || isPreview) && (
          <>
            {isInput && (
              <button
                onClick={lookup}
                disabled={!title.trim()}
                className="rounded-full bg-amber-500 px-5 py-2 text-sm font-semibold text-white hover:bg-amber-400 disabled:opacity-50 transition-colors"
              >
                Look up
              </button>
            )}

            {step.type === "preview" && step.match.existing && onAdded && (
              <button
                onClick={() => { const e = step.match.existing!; onAdded({ id: e.id, title: e.title, display_artist: e.display_artist }); }}
                className="rounded-full bg-amber-500 px-5 py-2 text-sm font-semibold text-white hover:bg-amber-400 transition-colors"
              >
                Add it to the set
              </button>
            )}

            {step.type === "preview" && step.match.existing?.match === "possible" && (
              <button
                onClick={() => submit(step.match, true)}
                className="rounded-full border border-zinc-200 px-5 py-2 text-sm text-zinc-500 hover:bg-zinc-50 transition-colors"
              >
                It&apos;s a different song — add it
              </button>
            )}

            {step.type === "preview" && !step.match.existing && (
              <>
                <button
                  onClick={() => submit(step.match)}
                  className="rounded-full bg-amber-500 px-5 py-2 text-sm font-semibold text-white hover:bg-amber-400 transition-colors"
                >
                  {step.match.youtube_id || step.match.spotify_url ? "Yes, that's the song — add it" : "Add song"}
                </button>
                {(step.match.youtube_id || step.match.spotify_url) && (
                  <button
                    onClick={() => submit(typed())}
                    className="rounded-full border border-zinc-200 px-5 py-2 text-sm text-zinc-500 hover:bg-zinc-50 transition-colors"
                  >
                    Not it — add what I typed
                  </button>
                )}
              </>
            )}

            <button
              onClick={() => { setOpen(false); setTitle(""); setArtist(""); setKnownAs(null); setFirstLine(""); reset(); onCancel?.(); }}
              className="rounded-full border border-zinc-200 px-5 py-2 text-sm text-zinc-600 hover:bg-zinc-50 transition-colors"
            >
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// Two optional details that help enrichment get the song right; skipping them
// adds the song exactly as before.
function AddHints({ knownAs, onKnownAs, firstLine, onFirstLine }: {
  knownAs: KnownAs | null;
  onKnownAs: (v: KnownAs | null) => void;
  firstLine: string;
  onFirstLine: (v: string) => void;
}) {
  return (
    <div className="space-y-3 rounded-xl bg-zinc-50 p-3">
      <div>
        <p id="known-as-label" className="text-sm font-medium text-zinc-700">
          How do you know it? <span className="font-normal text-zinc-400">Optional</span>
        </p>
        <div role="group" aria-labelledby="known-as-label" className="mt-1.5 flex flex-wrap gap-2">
          {KNOWN_AS.map((k) => (
            <button
              key={k.value}
              type="button"
              aria-pressed={knownAs === k.value}
              onClick={() => onKnownAs(knownAs === k.value ? null : k.value)}
              className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                knownAs === k.value ? "border-amber-500 bg-amber-500 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-amber-300"
              }`}
            >
              {k.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label htmlFor="add-song-first-line" className="block text-sm font-medium text-zinc-700">
          How does it start? <span className="font-normal text-zinc-400">Optional</span>
        </label>
        <input
          id="add-song-first-line"
          value={firstLine}
          onChange={(e) => onFirstLine(e.target.value)}
          maxLength={200}
          placeholder="The first line, if you know it"
          className="mt-1.5 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
        />
      </div>
      <p className="text-xs text-zinc-500">Helps us fill in the right writers, words and details.</p>
    </div>
  );
}

function MatchPreview({ match }: { match: Match }) {
  const trackId = spotifyTrackId(match.spotify_url);
  return (
    <div className="space-y-2">
      {match.existing ? (
        <p className="text-sm text-zinc-700">
          Already in the library: <span className="font-medium">{match.existing.title}</span>
          {match.existing.display_artist && <span className="text-zinc-500"> · {match.existing.display_artist}</span>}
          <Link href={`/songs/${match.existing.slug ?? match.existing.id}`} className="ml-2 font-medium text-amber-600 hover:text-amber-500">
            Open it
          </Link>
        </p>
      ) : (
        <p className="text-sm text-zinc-700">
          Is this the song? <span className="font-medium">{match.title}</span>
          {match.artist && <span className="text-zinc-500"> · {match.artist}</span>}
        </p>
      )}
      {match.youtube_id ? (
        <div className="overflow-hidden rounded-xl border border-zinc-200">
          <iframe
            className="aspect-video w-full"
            src={`https://www.youtube.com/embed/${match.youtube_id}`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      ) : trackId ? (
        <div className="overflow-hidden rounded-xl">
          <iframe
            src={`https://open.spotify.com/embed/track/${trackId}?utm_source=generator`}
            width="100%"
            height="152"
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            loading="lazy"
            className="border-0"
          />
        </div>
      ) : (
        <p className="text-xs text-zinc-400">No recording found to preview — you can still add the song.</p>
      )}
    </div>
  );
}
