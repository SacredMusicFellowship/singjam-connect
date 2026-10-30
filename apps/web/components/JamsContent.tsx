"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { canEditJam, fetchAllRows, jamTicketCta, summarizeTicketTiers, type JamTicketSummary, type JamTicketTier } from "@singjam/core";
import { FormattedDate, FormattedTime } from "@/components/FormattedTime";
import { supabaseBrowser } from "@/lib/supabase/client";

type RsvpStatus = "attending" | "waitlist" | "cancelled";

type JamsData = {
  userId: string | null;
  invitesEnabled: boolean;
  isAdmin: boolean;
  canHostOfficial: boolean;
  allJams: any[];
  rsvpByJam: Map<string, any>;
  inviteByJam: Map<string, any>;
  genresByJam: Map<string, string[]>;
  themesByJam: Map<string, string[]>;
  profileById: Map<string, { label: string; username: string | null }>;
  ticketSummaryByJam: Map<string, JamTicketSummary>;
};

const CACHE_KEY = "cache:/jams";

type JamsCache = {
  uid: string | null;
  invitesEnabled: boolean;
  isAdmin: boolean;
  canHostOfficial: boolean;
  allJams: any[];
  rsvpByJam: [string, any][];
  inviteByJam: [string, any][];
  genresByJam: [string, string[]][];
  themesByJam: [string, string[]][];
  profileById: [string, { label: string; username: string | null }][];
  ticketSummaryByJam: [string, JamTicketSummary][];
};

function RsvpBadge({ status, waitlistPosition }: { status: RsvpStatus; waitlistPosition?: number | null }) {
  if (status === "attending") {
    return <span className="shrink-0 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">Attending</span>;
  }
  if (status === "waitlist") {
    return (
      <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
        Waitlisted{waitlistPosition != null ? ` #${waitlistPosition}` : ""}
      </span>
    );
  }
  return null;
}

function JamListCard({ jam, tags, hostLabel, hostUsername, isOfficial, ticketSummary, rsvp, isInvited, isHosting, canEdit, onDeleted }: {
  jam: any;
  tags: string[];
  hostLabel?: string | null;
  hostUsername?: string | null;
  isOfficial: boolean;
  ticketSummary?: JamTicketSummary | null;
  rsvp?: { status: RsvpStatus; waitlist_position?: number | null } | null;
  isInvited?: boolean;
  isHosting?: boolean;
  /** Shows the Edit / Copy / Cancel menu — see canEditJam in @singjam/core. */
  canEdit?: boolean;
  onDeleted?: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Past events keep their card in the list, where a price or a ticket link
  // would be nonsense — the summary is only fetched for upcoming ones, but
  // tickets_url alone would otherwise still render a chip.
  const isPast = (jam.ends_at ?? jam.starts_at) < new Date().toISOString();
  const cta = isOfficial && !isPast
    ? jamTicketCta(jam.tickets_url, ticketSummary, { timezone: jam.timezone })
    : null;

  useEffect(() => {
    if (!canEdit) return;
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [canEdit]);

  async function deleteJam() {
    setDeleting(true);
    const res = await fetch(`/api/jam/${jam.id}`, { method: "DELETE" });
    if (res.ok) {
      onDeleted?.();
    } else {
      setDeleting(false);
      setConfirming(false);
    }
  }

  const cardBody = (
    <div className={`group relative flex overflow-hidden rounded-2xl border bg-white transition-colors ${isOfficial ? "border-amber-200 hover:border-amber-300" : "border-zinc-200 hover:border-zinc-300"}`}>
      {jam.image_url ? (
        <div className="relative shrink-0 w-24 sm:w-32 overflow-hidden bg-black">
          <Image src={jam.image_url} alt={jam.name ?? "Event"} fill className="object-contain" sizes="128px" />
        </div>
      ) : jam.starts_at ? (
        <div className={`shrink-0 w-20 flex flex-col items-center justify-center border-r px-2 py-4 ${isOfficial ? "bg-amber-50 border-amber-200" : "bg-zinc-50 border-zinc-100"}`}>
          <span className={`text-xs font-semibold uppercase tracking-wide ${isOfficial ? "text-amber-500" : "text-zinc-400"}`}>
            <FormattedDate iso={jam.starts_at} timezone={jam.timezone} options={{ weekday: "short" }} />
          </span>
          <span className="text-3xl font-bold text-zinc-900 leading-none">
            <FormattedDate iso={jam.starts_at} timezone={jam.timezone} options={{ day: "numeric" }} />
          </span>
          <span className={`text-xs font-semibold uppercase tracking-wide ${isOfficial ? "text-amber-500" : "text-zinc-400"}`}>
            <FormattedDate iso={jam.starts_at} timezone={jam.timezone} options={{ month: "short" }} />
          </span>
        </div>
      ) : null}

      <div className="flex-1 min-w-0 p-4">
        {isOfficial && (
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-500 mb-0.5">Official SingJam event</p>
        )}
        {!isOfficial && (jam.visibility === "community" || jam.visibility === "private" || isHosting) && (
          <div className="flex items-center gap-2 mb-0.5">
            {jam.visibility === "community" && (
              <span className="text-xs font-semibold uppercase tracking-wide text-sky-600">Public</span>
            )}
            {jam.visibility === "private" && (
              <span className="text-xs font-semibold uppercase tracking-wide text-violet-600">Private</span>
            )}
            {isHosting && (
              <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Hosting</span>
            )}
          </div>
        )}
        <div className="flex items-center gap-2">
          <p className="flex-1 min-w-0 font-semibold text-zinc-900 truncate">{jam.name ?? (isOfficial ? "SingJam event" : "Community jam")}</p>
          {isInvited && !rsvp && (
            <span className="shrink-0 rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">Invited</span>
          )}
          {rsvp && <RsvpBadge status={rsvp.status} waitlistPosition={rsvp.waitlist_position} />}
        </div>
        {jam.starts_at && (
          <p className="text-xs text-zinc-500 mt-0.5">
            <FormattedDate iso={jam.starts_at} timezone={jam.timezone} options={{ weekday: "short", month: "short", day: "numeric" }} />
            {" · "}
            <FormattedTime iso={jam.starts_at} timezone={jam.timezone} />
            {jam.ends_at && <> – <FormattedTime iso={jam.ends_at} timezone={jam.timezone} /></>}
          </p>
        )}
        {jam.neighborhood && <p className="text-xs text-zinc-400 mt-0.5">{jam.neighborhood}</p>}
        {tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {tags.map((t) => (
              <span key={t} className={`rounded-full px-2 py-0.5 text-xs ${isOfficial ? "bg-amber-50 text-amber-700" : "bg-zinc-100 text-zinc-600"}`}>{t}</span>
            ))}
          </div>
        )}
        {isOfficial ? (
          <p className="mt-2 text-xs text-zinc-400">
            Hosted by <span className="font-medium text-zinc-500">SingJam</span>
          </p>
        ) : (!isHosting && hostLabel && (
          <p className="mt-2 text-xs text-zinc-400">
            Hosted by <span className="font-medium text-zinc-500">{hostLabel}</span>
            {hostUsername && <span className="ml-1">@{hostUsername}</span>}
          </p>
        ))}
        {cta && (
          <div className="mt-2 flex flex-wrap gap-3">
            <span className={`text-xs font-medium ${cta.hasTickets && !cta.externalUrl ? "text-amber-600 group-hover:text-amber-500" : "text-zinc-500 group-hover:text-zinc-700"}`}>
              {cta.label} →
            </span>
            {cta.externalUrl && (
              <a
                href={cta.externalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="relative z-10 text-xs font-medium text-amber-600 hover:text-amber-500"
              >
                Get tickets ↗
              </a>
            )}
          </div>
        )}
      </div>
      {/* Stretched link rather than a wrapping <a>: the whole card goes to the
          detail page while the outbound ticket link keeps its own anchor. Last
          in the DOM so it paints over the poster image, which needs its own
          `relative` for next/image fill. */}
      <Link
        href={`/jam/${jam.short_code ?? jam.id}`}
        className="absolute inset-0 z-0"
        aria-label={jam.name ?? (isOfficial ? "SingJam event" : "Community jam")}
      />
    </div>
  );

  const wrapped = cardBody;

  if (!canEdit) return wrapped;

  return (
    <div className="relative">
      {wrapped}
      <div className="absolute top-2 right-2" ref={menuRef}>
        <button
          onClick={() => { setMenuOpen((o) => !o); setConfirming(false); }}
          className="rounded-lg p-1 bg-white/90 text-zinc-400 hover:text-zinc-600 hover:bg-white transition-colors shadow-sm"
          aria-label="More options"
        >
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden="true">
            <circle cx="4" cy="10" r="1.5" />
            <circle cx="10" cy="10" r="1.5" />
            <circle cx="16" cy="10" r="1.5" />
          </svg>
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-full mt-1 w-44 rounded-xl border border-zinc-200 bg-white shadow-lg z-10 overflow-hidden py-1">
            <Link
              href={`/jam/${jam.id}/edit`}
              className="flex items-center px-4 py-2.5 text-sm text-zinc-700 hover:bg-zinc-50 transition-colors"
            >
              Edit details
            </Link>
            <Link
              href={`/jam/new?copy=${jam.id}`}
              className="flex items-center px-4 py-2.5 text-sm text-zinc-700 hover:bg-zinc-50 transition-colors"
            >
              Copy event
            </Link>
            <button
              onClick={() => { setConfirming(true); setMenuOpen(false); }}
              className="w-full text-left flex items-center px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
            >
              Cancel jam
            </button>
          </div>
        )}
        {confirming && (
          <div className="absolute right-0 top-full mt-1 w-56 rounded-xl border border-red-300 bg-red-50 px-4 py-3 shadow-lg z-10 space-y-2">
            <p className="text-sm font-medium text-red-800">Cancel this jam? This can't be undone.</p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirming(false)}
                disabled={deleting}
                className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50 transition-colors"
              >
                Keep it
              </button>
              <button
                onClick={deleteJam}
                disabled={deleting}
                className="flex-1 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {deleting ? "Cancelling…" : "Yes, cancel"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function JamsContent() {
  const [data, setData] = useState<JamsData | null>(null);
  const supabase = supabaseBrowser();
  const hydratedUidRef = useRef<string | null | undefined>(undefined);

  // Show the cached jams list immediately on return visits; the fetch below
  // still runs and silently replaces it. Layout effect so cached rows paint
  // on the first frame.
  useLayoutEffect(() => {
    try {
      const raw = sessionStorage.getItem(CACHE_KEY);
      if (!raw) return;
      const c = JSON.parse(raw) as JamsCache;
      hydratedUidRef.current = c.uid;
      setData({
        userId: c.uid,
        invitesEnabled: c.invitesEnabled,
        isAdmin: c.isAdmin,
        canHostOfficial: c.canHostOfficial ?? false,
        allJams: c.allJams,
        rsvpByJam: new Map(c.rsvpByJam),
        inviteByJam: new Map(c.inviteByJam),
        genresByJam: new Map(c.genresByJam),
        themesByJam: new Map(c.themesByJam),
        profileById: new Map(c.profileById),
        ticketSummaryByJam: new Map(c.ticketSummaryByJam ?? []),
      });
    } catch {}
  }, []);

  async function fetchData() {
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user.id ?? null;

    // The cached data belongs to a different user (or a signed-out view) —
    // drop it immediately rather than let personalized rows keep showing.
    if (hydratedUidRef.current !== undefined && hydratedUidRef.current !== userId) {
      hydratedUidRef.current = userId;
      setData(null);
    }

    const [flagRes, adminRes, jamsRes, rsvpsRes, invitesRes] = await Promise.all([
      supabase.from("feature_flags").select("enabled").eq("key", "jam_invites").maybeSingle(),
      userId
        ? supabase.from("profiles").select("role, can_host_official").eq("id", userId).single()
        : Promise.resolve({ data: null }),
      fetchAllRows<any>((from, to) =>
        supabase
          .from("jams")
          .select("id, short_code, name, starts_at, ends_at, timezone, neighborhood, tickets_url, image_url, visibility, host_user_id, jam_genres(genres(name)), jam_themes(themes(name)), host:profiles!jams_host_user_id_fkey(display_name, last_name, username)")
          .gte("starts_at", new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString())
          .order("starts_at", { ascending: true, nullsFirst: false })
          .order("id")
          .range(from, to)
      ).then(
        (data) => ({ data }),
        (err: any) => {
          console.error(`[jams] could not load the jam list: ${err?.message ?? err}`);
          return { data: null };
        }
      ),
      userId
        ? supabase.from("jam_rsvps").select("jam_id, status, waitlist_position").eq("user_id", userId)
        : Promise.resolve({ data: [] }),
      userId
        ? supabase.from("jam_invites").select("jam_id, status").eq("invited_user_id", userId)
        : Promise.resolve({ data: [] }),
    ]);

    const allJams = (jamsRes.data ?? []) as any[];

    const rsvpByJam = new Map(((rsvpsRes.data ?? []) as any[]).map((r) => [r.jam_id, r]));
    const inviteByJam = new Map(((invitesRes.data ?? []) as any[]).map((i) => [i.jam_id, i]));
    const genresByJam = new Map<string, string[]>();
    const themesByJam = new Map<string, string[]>();
    const profileById = new Map<string, { label: string; username: string | null }>();

    for (const j of allJams) {
      const genres = ((j.jam_genres ?? []) as any[]).map((r) => r.genres?.name).filter(Boolean);
      if (genres.length > 0) genresByJam.set(j.id, genres);
      const themes = ((j.jam_themes ?? []) as any[]).map((r) => r.themes?.name).filter(Boolean);
      if (themes.length > 0) themesByJam.set(j.id, themes);
      if (j.host_user_id && j.host && !profileById.has(j.host_user_id)) {
        profileById.set(j.host_user_id, {
          label: [j.host.display_name, j.host.last_name].filter(Boolean).join(" ") || j.host.username || null,
          username: j.host.username ?? null,
        });
      }
    }

    const invitesEnabled = flagRes.data?.enabled ?? true;
    const isAdmin = (adminRes.data as any)?.role === "admin";
    const canHostOfficial = (adminRes.data as any)?.can_host_official === true;

    // Ticket state is only shown on upcoming official events, so the summary
    // call is scoped to those — one round trip for the section, not per tier.
    const listNow = new Date().toISOString();
    const officialIds = allJams
      .filter((j) => j.visibility === "official" && (j.ends_at ?? j.starts_at) >= listNow)
      .map((j) => j.id);
    const { data: tiers } = officialIds.length
      ? await supabase.rpc("jam_ticket_tiers", { jam_ids: officialIds })
      : { data: [] };
    const ticketSummaryByJam = summarizeTicketTiers(tiers as JamTicketTier[] | null);

    setData({
      userId,
      invitesEnabled,
      isAdmin,
      canHostOfficial,
      allJams,
      rsvpByJam,
      inviteByJam,
      genresByJam,
      themesByJam,
      profileById,
      ticketSummaryByJam,
    });

    try {
      const cache: JamsCache = {
        uid: userId,
        invitesEnabled,
        isAdmin,
        canHostOfficial,
        allJams,
        rsvpByJam: Array.from(rsvpByJam.entries()),
        inviteByJam: Array.from(inviteByJam.entries()),
        genresByJam: Array.from(genresByJam.entries()),
        themesByJam: Array.from(themesByJam.entries()),
        profileById: Array.from(profileById.entries()),
        ticketSummaryByJam: Array.from(ticketSummaryByJam.entries()),
      };
      sessionStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch {}
  }

  useEffect(() => {
    fetchData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!data) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-xl font-semibold">Jams</h1>
          <p className="text-sm text-zinc-500">Browse open jams or post your own.</p>
        </div>
        <section className="space-y-3">
          <div className="h-3 w-40 animate-pulse rounded bg-zinc-200" />
          <div className="grid grid-cols-1 gap-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex overflow-hidden rounded-2xl border border-zinc-200 bg-white">
                <div className="shrink-0 w-20 animate-pulse bg-zinc-100 border-r border-zinc-100 py-10" />
                <div className="flex-1 p-4 space-y-2">
                  <div className="h-4 w-2/3 animate-pulse rounded bg-zinc-200" />
                  <div className="h-3 w-1/2 animate-pulse rounded bg-zinc-100" />
                  <div className="h-3 w-1/3 animate-pulse rounded bg-zinc-100" />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    );
  }

  const { userId, invitesEnabled, isAdmin, canHostOfficial, allJams, rsvpByJam, inviteByJam, genresByJam, themesByJam, profileById, ticketSummaryByJam } = data;

  function cardProps(jam: any, opts: { isOfficial?: boolean; isHosting?: boolean } = {}) {
    return {
      jam,
      tags: [...(genresByJam.get(jam.id) ?? []), ...(themesByJam.get(jam.id) ?? [])],
      hostLabel: profileById.get(jam.host_user_id)?.label ?? null,
      hostUsername: profileById.get(jam.host_user_id)?.username ?? null,
      isOfficial: opts.isOfficial ?? false,
      ticketSummary: ticketSummaryByJam.get(jam.id) ?? null,
      isHosting: opts.isHosting ?? (!!userId && jam.host_user_id === userId),
      canEdit: canEditJam(jam, userId ? { id: userId, can_host_official: canHostOfficial } : null),
      rsvp: (rsvpByJam.get(jam.id) as any) ?? null,
      isInvited: (inviteByJam.get(jam.id) as any)?.status === "pending",
    };
  }

  const now = new Date().toISOString();
  const upcomingOfficialJams = allJams.filter(
    (j) => j.visibility === "official" && (j.ends_at ?? j.starts_at) >= now
  );
  const pendingInviteJams = userId
    ? allJams.filter((j) =>
        j.host_user_id !== userId &&
        (inviteByJam.get(j.id) as any)?.status === "pending" &&
        (j.ends_at ?? j.starts_at) >= now
      )
    : [];
  const hostingJams = userId
    ? allJams.filter((j) =>
        j.visibility !== "official" &&
        j.host_user_id === userId &&
        (j.ends_at ?? j.starts_at) >= now
      )
    : [];
  const communityJams = userId
    ? allJams.filter((j) =>
        j.visibility === "community" &&
        j.host_user_id !== userId &&
        (inviteByJam.get(j.id) as any)?.status !== "pending" &&
        (j.ends_at ?? j.starts_at) >= now
      )
    : [];
  const privateJams = userId
    ? allJams.filter((j) => {
        if (j.visibility !== "private" || j.host_user_id === userId) return false;
        if ((j.ends_at ?? j.starts_at) < now) return false;
        const s = (inviteByJam.get(j.id) as any)?.status;
        if (s === "accepted" || s === "declined") return true;
        // A guest who arrived on a link has no invite row — their RSVP is the
        // only thing tying them to the jam.
        const r = (rsvpByJam.get(j.id) as any)?.status;
        return r === "attending" || r === "waitlist";
      })
    : [];
  const pastJams = [...allJams]
    .reverse()
    .filter((j) => {
      if ((j.ends_at ?? j.starts_at) >= now) return false;
      if (j.visibility === "official") return true;
      if (!userId) return false;
      if (j.host_user_id === userId) return true;
      if (rsvpByJam.has(j.id)) return true;
      const s = (inviteByJam.get(j.id) as any)?.status;
      return s === "accepted" || s === "declined";
    });

  const isEmpty =
    upcomingOfficialJams.length === 0 &&
    pastJams.length === 0 &&
    pendingInviteJams.length === 0 &&
    hostingJams.length === 0 &&
    communityJams.length === 0 &&
    privateJams.length === 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Jams</h1>
        <p className="text-sm text-zinc-500">Browse open jams or post your own.</p>
      </div>

      {userId && (invitesEnabled || isAdmin) && (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Jams you're hosting</h2>
          <div className="grid grid-cols-1 gap-3">
            {hostingJams.map((jam) => <JamListCard key={jam.id} {...cardProps(jam, { isHosting: true })} onDeleted={fetchData} />)}
            <Link
              href="/jam/new"
              className="flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-zinc-200 px-4 py-4 text-sm font-medium text-zinc-400 hover:border-amber-300 hover:text-amber-500 transition-colors"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Post a jam
            </Link>
          </div>
        </section>
      )}

      {upcomingOfficialJams.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Upcoming SingJam events</h2>
          <div className="grid grid-cols-1 gap-3">
            {upcomingOfficialJams.map((jam) => <JamListCard key={jam.id} {...cardProps(jam, { isOfficial: true })} onDeleted={fetchData} />)}
          </div>
        </section>
      )}

      {userId && pendingInviteJams.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Invitations</h2>
          <div className="grid grid-cols-1 gap-3">
            {pendingInviteJams.map((jam) => <JamListCard key={jam.id} {...cardProps(jam)} />)}
          </div>
        </section>
      )}

      {userId && communityJams.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Community jams</h2>
          <div className="grid grid-cols-1 gap-3">
            {communityJams.map((jam) => <JamListCard key={jam.id} {...cardProps(jam)} />)}
          </div>
        </section>
      )}

      {userId && privateJams.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Private jams</h2>
          <div className="grid grid-cols-1 gap-3">
            {privateJams.map((jam) => <JamListCard key={jam.id} {...cardProps(jam)} />)}
          </div>
        </section>
      )}

      {pastJams.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Past events</h2>
          <div className="grid grid-cols-1 gap-3">
            {pastJams.map((jam) => (
              <JamListCard
                key={jam.id}
                {...cardProps(jam, {
                  isOfficial: jam.visibility === "official",
                  isHosting: jam.host_user_id === userId,
                })}
                onDeleted={fetchData}
              />
            ))}
          </div>
        </section>
      )}

      {!userId && (
        <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-center">
          <p className="text-base font-semibold text-zinc-900">Join the session</p>
          <p className="mt-2 text-sm text-zinc-500">
            Sign in to RSVP to community jams, post your own, and get invited to private sessions by other musicians.
          </p>
          <Link href="/auth?next=/jams" className="mt-4 inline-block text-sm font-medium text-amber-600 hover:text-amber-500">
            Sign in →
          </Link>
        </div>
      )}

      {userId && isEmpty && (
        <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-center">
          <p className="text-sm text-zinc-500">No jams yet. Be the first to post one!</p>
        </div>
      )}
    </div>
  );
}
