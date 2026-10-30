"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import LeaderSpotControls from "@/components/LeaderSpotControls";
import { supabaseBrowser } from "@/lib/supabase/client";
import { attendeeSummaryParts } from "@singjam/core";
import { SINGING_LABEL, voiceBadgeClass } from "@/lib/singingVoice";

type GuestAttendee = { name: string; extra: number };
/** Tickets an account holder bought beyond their own seat. */
type MemberExtra = { user_id: string; extra: number };

type AttendeeData = {
  profileMap: Map<string, any>;
  attending: any[];
  waitlist: any[];
  guests: GuestAttendee[];
  memberExtras: Map<string, number>;
  totalGoing: number;
  cohostIds: Set<string>;
};

function parseTags(profile: any): { label: string; voice: "lead" | "backup" | null }[] {
  const tags: { label: string; voice: "lead" | "backup" | null }[] = [];
  const voices: string[] = (profile?.singing_voice ?? "")
    .split(",")
    .filter((v: string) => v && v !== "none");
  for (const v of voices) {
    if (SINGING_LABEL[v]) tags.push({ label: SINGING_LABEL[v], voice: v as "lead" | "backup" });
  }
  const instruments: Record<string, string> = profile?.instrument_levels ?? {};
  for (const [name, level] of Object.entries(instruments)) {
    tags.push({ label: `${name} · ${level}`, voice: null });
  }
  return tags;
}

function AttendeeRow({
  profile,
  badge,
  action,
  extra = 0,
  footer,
}: {
  profile: any;
  badge: ReactNode;
  action?: ReactNode;
  footer?: ReactNode;
  /** Seats this person bought beyond their own, shown as "+2". */
  extra?: number;
}) {
  const fullName = [profile?.display_name, profile?.last_name].filter(Boolean).join(" ") || profile?.username || "Unknown";
  const tags = parseTags(profile);
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        {profile?.username ? (
          <Link href={`/u/${profile.username}`} className="text-sm font-medium text-zinc-900 hover:underline">
            {fullName}
            <span className="ml-1.5 text-xs font-normal text-zinc-400">@{profile.username}</span>
          </Link>
        ) : (
          <p className="text-sm font-medium text-zinc-900">{fullName}</p>
        )}
        {extra > 0 && (
          <span className="text-xs font-normal text-zinc-400" title={`Bought ${extra + 1} tickets`}>
            +{extra}
          </span>
        )}
        <div className="flex shrink-0 items-center gap-2">
          {badge}
          {action}
        </div>
      </div>
      {tags.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {tags.map(({ label, voice }) => (
            <span
              key={label}
              className={`rounded-full border px-2.5 py-0.5 text-xs ${voiceBadgeClass(voice)}`}
            >
              {label}
            </span>
          ))}
        </div>
      )}
      {footer && <div className="mt-2">{footer}</div>}
    </li>
  );
}

async function loadAttendees(
  supabase: ReturnType<typeof supabaseBrowser>,
  jamId: string,
  hostId: string | null
): Promise<AttendeeData> {
  const [rsvpsRes, hostRes, cohostsRes, guestsRes] = await Promise.all([
    supabase
      .from("jam_rsvps")
      .select("user_id, waitlist_position, status")
      .eq("jam_id", jamId)
      .in("status", ["attending", "waitlist"])
      .order("created_at", { ascending: true }),
    hostId
      ? supabase
          .from("profiles")
          .select("id, display_name, last_name, username, avatar_url, singing_voice, instrument_levels")
          .eq("id", hostId)
          .single()
      : Promise.resolve({ data: null }),
    supabase.from("jam_cohosts").select("user_id").eq("jam_id", jamId),
    // Ticket buyers without an account. Served by an API route because
    // tickets is service_role-only, so the browser client can't see them.
    fetch(`/api/jam/${jamId}/attendees/guests`)
      .then((r) => (r.ok ? r.json() : { guests: [], members: [] }))
      .catch(() => ({ guests: [], members: [] })),
  ]);

  const rsvps = rsvpsRes.data ?? [];
  const hostProfile = hostRes.data;
  const cohostIds = new Set<string>(((cohostsRes.data ?? []) as any[]).map((c: any) => c.user_id));
  const attendeeIds = (rsvps as any[])
    .map((r: any) => r.user_id)
    .filter((uid: string) => uid !== hostId);

  const profileMap = new Map<string, any>();
  if (hostId && hostProfile) profileMap.set(hostId, hostProfile);

  if (attendeeIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name, last_name, username, avatar_url, singing_voice, instrument_levels")
      .in("id", attendeeIds);
    for (const p of (profiles ?? []) as any[]) {
      profileMap.set(p.id, p);
    }
  }

  const attending = (rsvps as any[]).filter((r: any) => r.status === "attending" && r.user_id !== hostId);
  const waitlist = (rsvps as any[]).filter((r: any) => r.status === "waitlist");

  const guests: GuestAttendee[] = (guestsRes as any)?.guests ?? [];
  const guestHeads = guests.reduce((n, g) => n + 1 + g.extra, 0);

  // A member's RSVP row counts them once however many tickets they hold, so
  // the seats they bought for other people were counted nowhere — a couple
  // buying two registered as one person going while a guest buying two
  // registered as two.
  const memberExtras = new Map<string, number>(
    (((guestsRes as any)?.members ?? []) as MemberExtra[]).map((m) => [m.user_id, m.extra])
  );
  // Counted only for the people actually on screen, so the number can never
  // disagree with the list: a buyer whose RSVP is missing has no row to
  // hang "+2" on, and inflating the total from a row nobody can see is how
  // a headcount stops being explainable.
  const shown = [...(hostId ? [hostId] : []), ...attending.map((r: any) => r.user_id)];
  const memberHeads = shown.reduce((n, id) => n + (memberExtras.get(id) ?? 0), 0);

  return {
    profileMap,
    attending,
    waitlist,
    guests,
    memberExtras,
    // The host counts as going only when there is a host to count.
    totalGoing: (hostId ? 1 : 0) + attending.length + guestHeads + memberHeads,
    cohostIds,
  };
}

/**
 * `hostId` is null on official events: those belong to SingJam, so whoever
 * created the row is not credited as host and is not counted as attending.
 * They still appear as an ordinary "Going" row if they actually RSVP'd or
 * bought a ticket. jams.host_user_id keeps driving authorization either way.
 */
export default function JamAttendeeList({
  jamId,
  hostId,
  isHost,
  leaderIds = [],
  myLeader = null,
}: {
  jamId: string;
  hostId: string | null;
  isHost: boolean;
  /** Members leading the music who are listed publicly. */
  leaderIds?: string[];
  /** Set when the viewer leads this event: their row carries their controls. */
  myLeader?: { userId: string; token: string } | null;
}) {
  const [data, setData] = useState<AttendeeData | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const supabase = supabaseBrowser();
  const router = useRouter();

  useEffect(() => {
    loadAttendees(supabase, jamId, hostId).then(setData);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jamId, hostId]);

  async function toggleCohost(userId: string, makeCohost: boolean) {
    setPending(userId);
    const res = await fetch(`/api/jam/${jamId}/cohosts`, {
      method: makeCohost ? "POST" : "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    if (res.ok) {
      setData((prev) => {
        if (!prev) return prev;
        const cohostIds = new Set(prev.cohostIds);
        if (makeCohost) cohostIds.add(userId);
        else cohostIds.delete(userId);
        return { ...prev, cohostIds };
      });
    }
    setPending(null);
  }

  if (!data) return null;
  const { profileMap, attending, waitlist, guests, memberExtras, totalGoing, cohostIds } = data;

  return (
    <div id="whos-going" className="scroll-mt-24 rounded-2xl border border-zinc-200 bg-white p-5 space-y-1">
      <h2 className="text-base font-semibold mb-2">
        Who's going <span className="text-sm font-normal text-zinc-400">({totalGoing})</span>
      </h2>
      <ul className="divide-y divide-zinc-100">
        {hostId && (
          <AttendeeRow
            profile={profileMap.get(hostId)}
            extra={memberExtras.get(hostId) ?? 0}
            badge={
              <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                Host
              </span>
            }
          />
        )}
        {attending.map((r: any) => {
          const isCohost = cohostIds.has(r.user_id);
          const isMyLeaderRow = myLeader?.userId === r.user_id;
          return (
            <AttendeeRow
              key={r.user_id}
              profile={profileMap.get(r.user_id)}
              extra={memberExtras.get(r.user_id) ?? 0}
              footer={
                isMyLeaderRow && myLeader && (
                  <LeaderSpotControls
                    token={myLeader.token}
                    onWithdrawn={() => {
                      loadAttendees(supabase, jamId, hostId).then(setData);
                      router.refresh();
                    }}
                  />
                )
              }
              badge={
                isMyLeaderRow || leaderIds.includes(r.user_id) ? (
                  <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                    Leader
                  </span>
                ) : isCohost ? (
                  <span className="rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-medium text-violet-700">
                    Co-host
                  </span>
                ) : (
                  <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                    Going
                  </span>
                )
              }
              action={
                isHost && (
                  <button
                    onClick={() => toggleCohost(r.user_id, !isCohost)}
                    disabled={pending === r.user_id}
                    className="rounded-full border border-zinc-200 px-2.5 py-0.5 text-xs font-medium text-zinc-500 hover:bg-zinc-50 disabled:opacity-50 transition-colors"
                  >
                    {isCohost ? "Remove co-host" : "Make co-host"}
                  </button>
                )
              }
            />
          );
        })}
        {/* Guests sit with everyone else who is going — no account is needed to
            be counted as coming. They carry no profile, so no link and no tags. */}
        {guests.map((g, i) => (
          <li key={`guest-${i}`} className="py-3">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
              <p className="text-sm font-medium text-zinc-900">
                {g.name}
                {g.extra > 0 && (
                  <span className="ml-1.5 text-xs font-normal text-zinc-400">+{g.extra}</span>
                )}
              </p>
              <span className="shrink-0 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                Going
              </span>
            </div>
          </li>
        ))}
        {/* Reachable only since official events stopped seating their creator
            as host — before that, row one always existed. */}
        {totalGoing === 0 && waitlist.length === 0 && (
          <li className="py-3 text-sm text-zinc-400">No one yet — be the first.</li>
        )}
        {waitlist.map((r: any) => (
          <AttendeeRow
            key={r.user_id}
            profile={profileMap.get(r.user_id)}
            badge={
              <span className="shrink-0 rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600">
                #{r.waitlist_position} waitlist
              </span>
            }
          />
        ))}
      </ul>
    </div>
  );
}

const SUMMARY_AVATARS = 6;

/**
 * The compact "who's going" for the ticketed event page's side column, after
 * Luma: overlapping avatars, a couple of names and a count, the count linking
 * down to the full list. Fetches on its own rather than sharing the list's state so
 * either can render without the other; the rules live in loadAttendees.
 */
export function JamAttendeeSummary({ jamId, hostId }: { jamId: string; hostId: string | null }) {
  const [data, setData] = useState<AttendeeData | null>(null);
  const supabase = supabaseBrowser();

  useEffect(() => {
    loadAttendees(supabase, jamId, hostId).then(setData);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jamId, hostId]);

  if (!data || data.totalGoing === 0) return null;
  const { profileMap, attending, guests, totalGoing } = data;

  const people: { key: string; name: string; avatarUrl: string | null }[] = [
    ...[...(hostId ? [hostId] : []), ...attending.map((r: any) => r.user_id as string)].map((id) => {
      const p = profileMap.get(id);
      return {
        key: id,
        name: [p?.display_name, p?.last_name].filter(Boolean).join(" ") || p?.username || "Unknown",
        avatarUrl: p?.avatar_url ?? null,
      };
    }),
    ...guests.map((g, i) => ({ key: `guest-${i}`, name: g.name, avatarUrl: null })),
  ];

  const summary = attendeeSummaryParts(people.map((p) => p.name), totalGoing);

  return (
    <div>
      <h2 className="border-b border-zinc-200 pb-2 text-sm font-semibold text-zinc-700">
        {totalGoing} going
      </h2>
      <div className="mt-3 flex -space-x-2">
        {people.slice(0, SUMMARY_AVATARS).map((p) => (
          <span
            key={p.key}
            className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-amber-100 text-xs font-medium text-amber-700 ring-2 ring-white"
          >
            {p.avatarUrl ? (
              <Image src={p.avatarUrl} alt="" fill sizes="32px" className="object-cover" />
            ) : (
              p.name[0]?.toUpperCase()
            )}
          </span>
        ))}
      </div>
      {/* "14 others" doubles as the way down to the full list — in the text's
          own colour, so it doesn't compete with the amber Buy button. */}
      <p className="mt-2 text-sm text-zinc-600">
        {summary.named}
        {summary.others && (
          <>
            {" and "}
            <a href="#whos-going" className="hover:underline">
              {summary.others}
            </a>
          </>
        )}
      </p>
    </div>
  );
}
