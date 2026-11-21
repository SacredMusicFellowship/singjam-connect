"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/client";
import InviteToJamButton from "@/components/InviteToJamButton";
import SearchInput from "@/components/SearchInput";
import { SINGING_LABEL, voiceBadgeClass } from "@/lib/singingVoice";

type UserResult = {
  id: string;
  username: string | null;
  display_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
};

export default function MatchesPage() {
  const supabase = supabaseBrowser();

  const [loading, setLoading] = useState(true);
  const [isSignedIn, setIsSignedIn] = useState<boolean | null>(null);
  const [matches, setMatches] = useState<any[]>([]);
  const [invitesEnabled, setInvitesEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasRepertoire, setHasRepertoire] = useState(true);

  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<UserResult[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    async function load() {
      const { data } = await supabase.auth.getSession();
      const session = data.session;

      if (!session) {
        setIsSignedIn(false);
        setLoading(false);
        return;
      }
      setIsSignedIn(true);

      const [{ data: res, error }, { data: flagData }, { count }] = await Promise.all([
        supabase.rpc("match_jammers", { for_user_id: session.user.id, limit_n: 30 }),
        supabase.from("feature_flags").select("enabled").eq("key", "jam_invites").maybeSingle(),
        supabase.from("user_songs").select("song_id", { count: "exact", head: true }).eq("user_id", session.user.id),
      ]);

      if (error) {
        console.error("Matching error:", error);
        setError("Could not load matches. Please try again.");
      }
      setMatches((res as any[]) ?? []);
      setInvitesEnabled((flagData as any)?.enabled ?? true);
      setHasRepertoire((count ?? 0) > 0);
      setLoading(false);
    }

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (query.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(query.trim())}`);
        if (res.ok) setSearchResults(await res.json());
      } finally {
        setSearching(false);
      }
    }, 300);
  }, [query]);

  const isSearching = query.trim().length >= 2;

  if (!loading && isSignedIn === false) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold">Find jammers</h1>
          <p className="mt-1 text-sm text-zinc-500">Matched by shared songs and genre overlap.</p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
          <p className="text-base font-semibold text-zinc-900">See who you could jam with</p>
          <p className="mt-2 text-sm text-zinc-500">
            SingJam matches you with musicians who know the same songs as you. Add songs to your repertoire and we&apos;ll rank your best potential jam partners.
          </p>
          <Link href="/auth?next=/friends" className="mt-4 inline-block text-sm font-medium text-amber-600 hover:text-amber-500">
            Sign in →
          </Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">Find jammers</h1>
        <p className="text-sm text-zinc-600">Matches are ranked by shared songs and genre overlap.</p>
        <div className="grid gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-zinc-200" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-4 w-32 animate-pulse rounded bg-zinc-200" />
                  <div className="h-3 w-20 animate-pulse rounded bg-zinc-100" />
                </div>
                <div className="space-y-1 text-right">
                  <div className="ml-auto h-4 w-6 animate-pulse rounded bg-zinc-200" />
                  <div className="h-3 w-16 animate-pulse rounded bg-zinc-100" />
                </div>
              </div>
              <div className="mt-3 flex gap-1.5">
                <div className="h-5 w-20 animate-pulse rounded-full bg-zinc-100" />
                <div className="h-5 w-16 animate-pulse rounded-full bg-zinc-100" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Find jammers</h1>

      {/* Search input */}
      <SearchInput
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onClear={() => setQuery("")}
        placeholder="Search by name, username, or email"
      />

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Search results */}
      {isSearching ? (
        <div className="grid gap-3">
          {searching ? (
            [0, 1, 2].map((i) => (
              <div key={i} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-zinc-200" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-4 w-32 animate-pulse rounded bg-zinc-200" />
                    <div className="h-3 w-20 animate-pulse rounded bg-zinc-100" />
                  </div>
                </div>
              </div>
            ))
          ) : searchResults.length === 0 ? (
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-center shadow-sm">
              <p className="text-sm text-zinc-500">No users found for &ldquo;{query}&rdquo;</p>
            </div>
          ) : (
            searchResults.map((u) => {
              const fullName = [u.display_name, u.last_name].filter(Boolean).join(" ");
              const initial = (u.display_name ?? u.username ?? "?")[0].toUpperCase();
              return (
                <div key={u.id} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full border border-zinc-200 bg-zinc-100">
                      {u.avatar_url ? (
                        <Image src={u.avatar_url} alt={fullName || "Avatar"} fill sizes="40px" className="object-cover" />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-sm font-medium text-zinc-400">
                          {initial}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <Link
                        href={u.username ? `/u/${u.username}` : `/profile/${u.id}`}
                        className="block truncate font-semibold text-zinc-900 hover:text-amber-600"
                      >
                        {fullName || u.username || "Someone"}
                      </Link>
                      {u.username && <div className="truncate text-xs text-zinc-400">@{u.username}</div>}
                    </div>
                  </div>
                  <div className="mt-4 flex gap-2">
                    <a
                      className="flex flex-1 items-center justify-center rounded-full border border-zinc-200 px-3 py-2 text-sm no-underline hover:bg-zinc-50 sm:flex-none sm:py-1.5"
                      href={u.username ? `/u/${u.username}` : `/profile/${u.id}`}
                    >
                      View profile
                    </a>
                    <InviteToJamButton inviteeUserId={u.id} disabled={!invitesEnabled} />
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : (
        <>
          <p className="text-sm text-zinc-600">
            Matches are ranked by shared songs and genre overlap.
          </p>

          <div className="grid gap-3">
            {matches.map((m: any) => {
              const fullName = [m.display_name, m.last_name].filter(Boolean).join(" ");
              const SINGING_ORDER = ["lead", "backup"];
              const singingVoices: string[] = m.singing_voice
                ? m.singing_voice.split(",").filter((v: string) => v !== "none").sort((a: string, b: string) => SINGING_ORDER.indexOf(a) - SINGING_ORDER.indexOf(b))
                : [];
              const instrumentLevels: Record<string, string> = m.instrument_levels ?? {};
              const topInstruments = Object.entries(instrumentLevels)
                .sort(([, a], [, b]) => {
                  const order = ["Professional", "Advanced", "Intermediate", "Beginner"];
                  return order.indexOf(a) - order.indexOf(b);
                })
                .slice(0, 3)
                .map(([name]) => name);
              const sharedGenres: string[] = m.shared_genres ?? [];
              const initial = (m.display_name ?? m.username ?? "?")[0].toUpperCase();

              return (
                <div key={m.user_id} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
                  {/* Header */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full border border-zinc-200 bg-zinc-100">
                      {m.avatar_url ? (
                        <Image src={m.avatar_url} alt={fullName || "Avatar"} fill sizes="40px" className="object-cover" />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-sm font-medium text-zinc-400">
                          {initial}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <Link
                        href={m.username ? `/u/${m.username}` : `/profile/${m.user_id}`}
                        className="block truncate font-semibold text-zinc-900 hover:text-amber-600"
                      >
                        {fullName || m.username || "Someone"}
                      </Link>
                      {m.username && <div className="truncate text-xs text-zinc-400">@{m.username}</div>}
                      {m.neighborhood && <div className="truncate text-xs text-zinc-500">{m.neighborhood}</div>}
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-semibold text-zinc-900">{m.shared_count}</div>
                      <div className="text-xs text-zinc-400">shared songs</div>
                    </div>
                  </div>

                  {/* Badges */}
                  {(singingVoices.length > 0 || topInstruments.length > 0) && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {singingVoices.map((v: string) => (
                        <span key={v} className={`rounded-full border px-2.5 py-0.5 text-xs ${voiceBadgeClass(v as "lead" | "backup")}`}>
                          {SINGING_LABEL[v] ?? v}
                        </span>
                      ))}
                      {topInstruments.map((name) => (
                        <span key={name} className="rounded-full bg-zinc-100 border border-zinc-200 px-2.5 py-0.5 text-xs text-zinc-600">
                          {name}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Shared songs */}
                  {Array.isArray(m.top_shared) && m.top_shared.length > 0 && (
                    <div className="mt-3 text-xs text-zinc-500">
                      <span className="font-medium text-zinc-700">Shared songs: </span>
                      {m.top_shared.slice(0, 5).join(", ")}
                      {m.shared_count > 5 && ` +${m.shared_count - 5} more`}
                    </div>
                  )}

                  {/* Shared genres */}
                  {sharedGenres.length > 0 && (
                    <div className="mt-1.5 text-xs text-zinc-500">
                      <span className="font-medium text-zinc-700">Shared genres: </span>
                      {sharedGenres.slice(0, 5).join(", ")}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="mt-4 flex gap-2">
                    <a
                      className="flex flex-1 items-center justify-center rounded-full border border-zinc-200 px-3 py-2 text-sm no-underline hover:bg-zinc-50 sm:flex-none sm:py-1.5"
                      href={m.username ? `/u/${m.username}` : `/profile/${m.user_id}`}
                    >
                      View profile
                    </a>
                    <InviteToJamButton inviteeUserId={m.user_id} disabled={!invitesEnabled} />
                  </div>
                </div>
              );
            })}
          </div>

          {!hasRepertoire ? (
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-center shadow-sm">
              <p className="text-base font-semibold text-zinc-900">Your repertoire is empty</p>
              <p className="mt-1 text-sm text-zinc-500">Add songs you know and SingJam will match you with musicians who share your repertoire.</p>
              <Link
                href="/search"
                className="mt-4 inline-block rounded-full bg-amber-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-amber-400 transition-colors"
              >
                Browse songs →
              </Link>
            </div>
          ) : matches.length === 0 && (
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-center shadow-sm">
              <p className="text-base font-semibold text-zinc-900">No matches yet</p>
              <p className="mt-1 text-sm text-zinc-500">As more musicians join and add songs, you&apos;ll start seeing matches here.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
