"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Step =
  | { type: "input" }
  | { type: "looking-up" }
  | { type: "preview"; spotifyUrl: string | null }
  | { type: "submitting" };

function spotifyTrackId(url: string | null): string | null {
  if (!url) return null;
  return url.match(/\/track\/([a-zA-Z0-9]+)/)?.[1] ?? null;
}

export default function SubmitSongForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [step, setStep] = useState<Step>({ type: "input" });
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setStep({ type: "input" });
    setError(null);
  }

  async function lookup() {
    if (!title.trim()) return;
    setError(null);
    setStep({ type: "looking-up" });

    const params = new URLSearchParams({ title: title.trim() });
    if (artist.trim()) params.set("artist", artist.trim());

    try {
      const res = await fetch(`/api/songs/lookup?${params}`);
      const json = res.ok ? await res.json() : {};
      setStep({ type: "preview", spotifyUrl: json.spotify_url ?? null });
    } catch {
      setStep({ type: "preview", spotifyUrl: null });
    }
  }

  async function submit(spotifyUrl: string | null) {
    setError(null);
    setStep({ type: "submitting" });

    const body: Record<string, string> = { title: title.trim() };
    if (artist.trim()) body.artist = artist.trim();
    if (spotifyUrl) body.spotify_url = spotifyUrl;

    const res = await fetch("/api/songs/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();

    if (res.status === 409) {
      setError("This song is already in our library.");
      setStep({ type: "preview", spotifyUrl });
      if (json.slug) setTimeout(() => router.push(`/songs/${json.slug}`), 1500);
      return;
    }

    if (!res.ok) {
      setError(json.error ?? "Something went wrong. Please try again.");
      setStep({ type: "preview", spotifyUrl });
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
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 space-y-4">
      <div>
        <h2 className="text-base font-semibold">Add a missing song</h2>
        <p className="mt-0.5 text-xs text-zinc-500">
          We'll look it up and add it to the library. It'll be available for you to add to your repertoire straight away.
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

      {isLookingUp && (
        <p className="text-xs text-zinc-400">Searching Spotify…</p>
      )}

      {isSubmitting && (
        <p className="text-xs text-zinc-400">Looking up song info — this may take a few seconds…</p>
      )}

      {isPreview && (
        <SpotifyPreview
          spotifyUrl={(step as { type: "preview"; spotifyUrl: string | null }).spotifyUrl}
        />
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

            {isPreview && (
              <>
                <button
                  onClick={() => submit((step as { type: "preview"; spotifyUrl: string | null }).spotifyUrl)}
                  className="rounded-full bg-amber-500 px-5 py-2 text-sm font-semibold text-white hover:bg-amber-400 transition-colors"
                >
                  {(step as { type: "preview"; spotifyUrl: string | null }).spotifyUrl
                    ? "That's the right song — add it"
                    : "Add song"}
                </button>
                {(step as { type: "preview"; spotifyUrl: string | null }).spotifyUrl && (
                  <button
                    onClick={() => submit(null)}
                    className="rounded-full border border-zinc-200 px-5 py-2 text-sm text-zinc-500 hover:bg-zinc-50 transition-colors"
                  >
                    Wrong match — add anyway
                  </button>
                )}
              </>
            )}

            <button
              onClick={() => { setOpen(false); setTitle(""); setArtist(""); reset(); }}
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

function SpotifyPreview({ spotifyUrl }: { spotifyUrl: string | null }) {
  const trackId = spotifyTrackId(spotifyUrl);

  if (!trackId) {
    return (
      <p className="text-xs text-zinc-400">
        No Spotify match found — you can still add the song.
      </p>
    );
  }

  return (
    <div className="rounded-xl overflow-hidden">
      <iframe
        src={`https://open.spotify.com/embed/track/${trackId}?utm_source=generator`}
        width="100%"
        height="152"
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        loading="lazy"
        className="border-0"
      />
    </div>
  );
}
