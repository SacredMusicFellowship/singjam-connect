"use client";

import { browsePath, songCardPills, songCardCredits, hasLeadVoice, productionCredits, type CardCredit, type CardIdentity, type ProductionCredit, type RecordingArtistCredit } from "@singjam/core";
import { Fragment, useState } from "react";
import Link from "next/link";
import RoleSelect from "@/components/RoleSelect";
import ConfidencePicker from "@/components/ConfidencePicker";

export const LEVELS = [
  { key: "lead", label: "Lead" },
  { key: "support", label: "Support" },
  { key: "learn", label: "Learn" },
] as const;

function YoutubeIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  );
}

function SpotifyIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
    </svg>
  );
}

function Credits({ credits }: { credits: CardCredit[] }) {
  return credits.map((c, i) => (
    <Fragment key={c.text}>
      {i > 0 && ", "}
      {c.lead}
      {c.link ? (
        <Link href={browsePath(c.link.kind, c.link.key, { traditional: c.link.traditional })} className="relative z-10 hover:text-amber-700 hover:underline">{c.text}</Link>
      ) : c.text}
    </Fragment>
  ));
}

export default function SongCard({
  songId,
  title,
  slug,
  displayArtist,
  byline,
  cardIdentity,
  composers,
  cultures,
  productions,
  productionCredits: productionCreditsProp,
  recordingArtists,
  aka,
  genres,
  forms,
  occasions,
  communities,
  languages,
  context,
  popularity,
  youtubeId,
  spotifyTrackId,
  repertoire,
  pendingAddId,
  singingVoice,
  setPendingAddId,
  onAdd,
  addSong,
  onVoiceUpdated,
}: {
  songId: string;
  title: string;
  slug: string | null;
  displayArtist: string | null;
  byline?: string | null;
  cardIdentity?: CardIdentity;
  composers: string[];
  cultures: string[];
  productions: string[];
  productionCredits?: ProductionCredit[] | null;
  recordingArtists?: RecordingArtistCredit[] | null;
  aka: string[] | null;
  genres: string[];
  forms?: string[] | null;
  occasions?: string[] | null;
  communities?: string[] | null;
  // One extra line for where the card appears: a songwriter's role, a match reason…
  context?: string | null;
  languages: string[];
  popularity?: number;
  youtubeId?: string | null;
  spotifyTrackId?: string | null;
  repertoire: Map<string, string>;
  pendingAddId: string | null;
  singingVoice: string | null;
  setPendingAddId: (id: string | null) => void;
  onAdd: (id: string, slug?: string | null) => void | Promise<void>;
  addSong: (songId: string, level: string) => void;
  onVoiceUpdated: (voice: string) => void;
}) {
  const [youtubeOpen, setYoutubeOpen] = useState(false);
  const [spotifyOpen, setSpotifyOpen] = useState(false);
  const [askingLeadVoice, setAskingLeadVoice] = useState(false);
  const inRepertoire = repertoire.has(songId);
  const confidence = repertoire.get(songId);
  const confidenceLabel = LEVELS.find((l) => l.key === confidence)?.label ?? confidence;
  const picking = pendingAddId === songId;
  const href = `/songs/${slug ?? songId}`;
  const credits = songCardCredits({ title, byline, displayArtist, composers, cultures: cultures ?? [], recordingArtists, identity: cardIdentity });
  const shows = productionCredits(productionCreditsProp, productions);
  const pills = songCardPills({ forms, occasions, genres, communities, languages });

  return (
    <div className="relative isolate rounded-2xl border border-zinc-200 p-4 shadow-sm hover:border-zinc-300">
      <div className="flex items-start gap-2 min-w-0">
        <div className="flex-1 min-w-0">
          <div className="font-medium">
            <Link href={href} className="relative z-10 hover:text-amber-600">
              {title}
            </Link>
            {credits.writers.length > 0 && (
              <span className="ml-1 font-normal text-zinc-400">
                (<Credits credits={credits.writers} />)
              </span>
            )}
          </div>
          {shows.length > 0 ? (
            <div className="text-sm text-zinc-500">
              from{" "}
              {shows.map((p, i) => (
                <Fragment key={`${p.name}-${p.year}`}>
                  {i > 0 && ", "}
                  <em>{p.name}</em>
                  {p.year ? ` (${p.year})` : null}
                </Fragment>
              ))}
              {credits.line.length > 0 && <> · <Credits credits={credits.line} /></>}
            </div>
          ) : credits.line.length > 0 ? (
            <div className="text-sm text-zinc-500"><Credits credits={credits.line} /></div>
          ) : null}
          {aka && aka.length ? (
            <div className="text-xs text-zinc-500">aka: {aka.join(" · ")}</div>
          ) : null}
          {context ? <div className="text-xs text-zinc-500">{context}</div> : null}
        </div>
        <div className="relative z-10 shrink-0 flex items-center gap-0.5">
          {youtubeId && (
            <button
              onClick={() => setYoutubeOpen((o) => !o)}
              className={`rounded-lg p-1.5 transition-colors text-red-500 ${youtubeOpen ? "bg-red-50" : "hover:bg-red-50"}`}
              title={youtubeOpen ? "Close video" : "Watch on YouTube"}
            >
              <YoutubeIcon />
            </button>
          )}
          {spotifyTrackId && (
            <button
              onClick={() => setSpotifyOpen((o) => !o)}
              className={`rounded-lg p-1.5 transition-colors text-green-500 ${spotifyOpen ? "bg-green-50" : "hover:bg-green-50"}`}
              title={spotifyOpen ? "Close player" : "Play on Spotify"}
            >
              <SpotifyIcon />
            </button>
          )}
        </div>
      </div>
      {youtubeOpen && youtubeId && (
        <div className="relative z-10 mt-3 rounded-xl overflow-hidden border border-zinc-200">
          <div className="relative w-full" style={{ paddingBottom: "56.25%" }}>
            <iframe
              className="absolute inset-0 w-full h-full"
              src={`https://www.youtube.com/embed/${youtubeId}`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        </div>
      )}
      {spotifyOpen && spotifyTrackId && (
        <iframe
          src={`https://open.spotify.com/embed/track/${spotifyTrackId}?utm_source=generator`}
          width="100%"
          height="152"
          className="relative z-10 mt-3 rounded-xl border-0"
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          loading="lazy"
        />
      )}
      {(pills.length > 0 || (popularity ?? 0) > 0) && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {pills.map((p) => (
            <Link
              key={`${p.type}:${p.name}`}
              href={browsePath(p.type, p.slug)}
              className="relative z-10 rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-xs text-zinc-500 hover:border-amber-300 hover:text-amber-700"
            >
              {p.name}
            </Link>
          ))}
          {(popularity ?? 0) > 0 && (
            <span className="text-xs text-zinc-400">{popularity} know{popularity === 1 ? "s" : ""} it</span>
          )}
        </div>
      )}
      <div className="relative z-10 mt-3 flex flex-wrap items-center gap-1.5">
        {inRepertoire && !askingLeadVoice ? (
          <>
            <RoleSelect
              value={confidence ?? "learn"}
              size="md"
              label={`Role for ${title}`}
              onChange={(level) => {
                if (level === "lead" && !hasLeadVoice(singingVoice)) {
                  setAskingLeadVoice(true);
                } else {
                  addSong(songId, level);
                }
              }}
            />
          </>
        ) : (inRepertoire && askingLeadVoice) || picking ? (
          <ConfidencePicker
            singingVoice={singingVoice}
            initialAskVoice={askingLeadVoice}
            onSave={(level) => { addSong(songId, level); setAskingLeadVoice(false); }}
            offerLearn={!picking}
            onCancel={() => { setPendingAddId(null); setAskingLeadVoice(false); }}
            onVoiceUpdated={onVoiceUpdated}
          />
        ) : (
          <>
            <button
              className="rounded-full bg-indigo-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-400 transition-colors"
              onClick={() => onAdd(songId, slug)}
            >
              I know this song!
            </button>
            <button className="rounded-full bg-white px-3 py-1.5 text-sm font-medium text-indigo-600 ring-1 ring-inset ring-indigo-200 hover:bg-indigo-50 transition-colors" onClick={() => addSong(songId, "learn")}>
              Want to learn it
            </button>
          </>
        )}
      </div>
      {/* The whole card opens the song: an overlay last in the DOM, under the lifted controls. */}
      <Link href={href} aria-label={title} tabIndex={-1} className="absolute inset-0 rounded-2xl" />
    </div>
  );
}
