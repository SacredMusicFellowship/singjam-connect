import Image from "next/image";
import Link from "next/link";
import LogoutButton from "@/components/LogoutButton";
import InviteToJamButton from "@/components/InviteToJamButton";
import { SINGING_LABEL, voiceBadgeClass } from "@/lib/singingVoice";
import type { ProfileSong } from "@/lib/fetchProfileSongs";

const INSTRUMENT_LEVEL_ORDER = ["Professional", "Advanced", "Intermediate", "Beginner"];

export interface ProfileData {
  id: string;
  display_name: string | null;
  last_name: string | null;
  username: string | null;
  avatar_url: string | null;
  neighborhood: string | null;
  singing_voice: string | null;
  instrument_levels: Record<string, string> | null;
  favorite_genres: string[] | null;
}

export default function ProfileDisplay({
  profile,
  isOwner = false,
  invitesEnabled = true,
  sharedSongs,
  additionalSongs,
  wantsToLearnSongs,
}: {
  profile: ProfileData;
  isOwner?: boolean;
  invitesEnabled?: boolean;
  sharedSongs?: ProfileSong[];
  additionalSongs?: ProfileSong[];
  wantsToLearnSongs?: ProfileSong[];
}) {
  const fullName = [profile.display_name, profile.last_name].filter(Boolean).join(" ");
  const SINGING_ORDER = ["lead", "backup"];
  const singingVoices = profile.singing_voice
    ? profile.singing_voice.split(",").filter((v) => v !== "none").sort((a, b) => SINGING_ORDER.indexOf(a) - SINGING_ORDER.indexOf(b))
    : [];
  const instrumentLevels = profile.instrument_levels ?? {};
  const favoriteGenres = profile.favorite_genres ?? [];

  const sortedInstruments = Object.entries(instrumentLevels).sort(
    ([aName, aLevel], [bName, bLevel]) => {
      const diff = INSTRUMENT_LEVEL_ORDER.indexOf(aLevel) - INSTRUMENT_LEVEL_ORDER.indexOf(bLevel);
      return diff !== 0 ? diff : aName.localeCompare(bName);
    }
  );

  const initial = (profile.display_name ?? profile.username ?? "?")[0].toUpperCase();

  return (
    <div className="max-w-lg mx-auto space-y-6">
      {/* Header */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full border border-zinc-200 bg-zinc-100">
            {profile.avatar_url ? (
              <Image
                src={profile.avatar_url}
                alt={fullName || "Profile"}
                fill
                sizes="80px"
                className="object-cover"
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-3xl text-zinc-400">
                {initial}
              </span>
            )}
          </div>
          <div>
            {fullName && (
              <div className="text-xl font-semibold text-zinc-900">{fullName}</div>
            )}
            {profile.username && (
              <div className="text-sm text-zinc-500">@{profile.username}</div>
            )}
            {profile.neighborhood && (
              <div className="mt-1 text-sm text-zinc-500">{profile.neighborhood}</div>
            )}
          </div>
        </div>
      </div>

      {/* Singing */}
      {singingVoices.length > 0 && (
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-400 mb-3">
            Singing
          </div>
          <div className="flex flex-wrap gap-2">
            {singingVoices.map((v) => (
              <span
                key={v}
                className={`rounded-full border px-3 py-1 text-sm ${voiceBadgeClass(v as "lead" | "backup")}`}
              >
                {SINGING_LABEL[v] ?? v}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Instruments */}
      {sortedInstruments.length > 0 && (
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-400 mb-3">
            Instruments
          </div>
          <div className="flex flex-wrap gap-2">
            {sortedInstruments.map(([name, level]) => (
              <span
                key={name}
                className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-50 pl-3 pr-3 py-1 text-sm text-zinc-700"
              >
                <span className="font-medium">{name}</span>
                <span className="text-zinc-400">·</span>
                <span className="text-zinc-500">{level}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Favorite genres */}
      {favoriteGenres.length > 0 && (
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-400 mb-3">
            Favorite genres
          </div>
          <div className="flex flex-wrap gap-2">
            {favoriteGenres
              .slice()
              .sort((a, b) => a.localeCompare(b))
              .map((g) => (
                <span
                  key={g}
                  className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-sm text-zinc-700"
                >
                  {g}
                </span>
              ))}
          </div>
        </div>
      )}

      {/* Shared songs */}
      {sharedSongs && sharedSongs.length > 0 && (() => {
        const titleCounts = sharedSongs.reduce<Record<string, number>>((acc, s) => {
          acc[s.title] = (acc[s.title] ?? 0) + 1;
          return acc;
        }, {});
        return (
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="text-xs font-medium uppercase tracking-wide text-zinc-400 mb-1">
              Shared repertoire ({sharedSongs.length})
            </div>
            <p className="text-xs font-semibold text-zinc-900 mb-3">Bold = can lead</p>
            <ul className="space-y-1">
              {sharedSongs.map((s) => (
                <li key={s.song_id} className={`text-sm ${s.confidence === "lead" ? "font-semibold text-zinc-900" : "text-zinc-700"}`}>
                  <a href={`/songs/${s.slug ?? s.song_id}`} target="_blank" rel="noopener noreferrer" className="hover:underline">
                    {titleCounts[s.title] > 1 && (s.byline ?? s.display_artist)
                      ? `${s.title} (${s.byline ?? s.display_artist})`
                      : s.title}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        );
      })()}

      {/* Additional songs */}
      {additionalSongs && additionalSongs.length > 0 && (
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-400 mb-1">
            Additional songs ({additionalSongs.length})
          </div>
          <p className="text-xs font-semibold text-zinc-900 mb-3">Bold = can lead</p>
          <ul className="space-y-1">
            {additionalSongs.map((s) => (
              <li key={s.song_id} className={`text-sm ${s.confidence === "lead" ? "font-semibold text-zinc-900" : "text-zinc-700"}`}>
                <a href={`/songs/${s.slug ?? s.song_id}`} target="_blank" rel="noopener noreferrer" className="hover:underline">
                  {s.title}{(s.byline ?? s.display_artist) ? ` · ${s.byline ?? s.display_artist}` : ""}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Wants to learn */}
      {wantsToLearnSongs && wantsToLearnSongs.length > 0 && (
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-400 mb-3">
            Want to learn ({wantsToLearnSongs.length})
          </div>
          <ul className="space-y-1">
            {wantsToLearnSongs.map((s) => (
              <li key={s.song_id} className="text-sm text-zinc-700">
                <a href={`/songs/${s.slug ?? s.song_id}`} target="_blank" rel="noopener noreferrer" className="hover:underline">
                  {s.title}{(s.byline ?? s.display_artist) ? ` · ${s.byline ?? s.display_artist}` : ""}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        {isOwner ? (
          <>
            <Link
              href="/account"
              className="flex-1 rounded-full border border-zinc-200 px-4 py-2.5 text-center text-sm text-zinc-600 hover:bg-zinc-50 sm:flex-none"
            >
              Edit profile
            </Link>
            <div className="sm:hidden">
              <LogoutButton variant="light" />
            </div>
          </>
        ) : (
          <InviteToJamButton inviteeUserId={profile.id} disabled={!invitesEnabled} />
        )}
      </div>
    </div>
  );
}
