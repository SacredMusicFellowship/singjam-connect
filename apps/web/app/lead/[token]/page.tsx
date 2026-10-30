import type { Metadata } from "next";
import Link from "next/link";
import { jamPath } from "@singjam/core";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { leaderByToken } from "@/lib/jamLeaders";
import { formatJamTime } from "@/lib/formatJamTime";
import LeaderSpot from "./LeaderSpot";

// Where a leader's email sends them to manage their spot. The token is the
// credential, so this works without signing in — many leaders won't have an
// account yet.

export const metadata: Metadata = { title: "Your leader spot", robots: { index: false } };

export default async function LeaderSpotPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = supabaseAdmin();
  const leader = await leaderByToken(admin, token);

  const { data: jam } = leader
    ? await admin.from("jams").select("id, short_code, name, starts_at, timezone").eq("id", leader.jam_id).maybeSingle()
    : { data: null };

  if (!leader || !jam) {
    return (
      <div className="mx-auto max-w-md space-y-2 py-8">
        <h1 className="text-xl font-semibold text-zinc-900">This link is no longer active</h1>
        <p className="text-sm text-zinc-500">
          You may have already stepped down, or the host has updated the event&apos;s leaders.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-4 py-8">
      <div>
        <p className="text-xs font-medium tracking-wide text-zinc-500">You&apos;re leading at</p>
        <h1 className="mt-1 text-xl font-semibold text-zinc-900">
          <Link href={jamPath(jam)} className="hover:underline">
            {jam.name ?? "this event"}
          </Link>
        </h1>
        {jam.starts_at && <p className="mt-1 text-sm text-zinc-500">{formatJamTime(jam.starts_at, jam.timezone)}</p>}
      </div>
      <LeaderSpot token={token} showPublicly={leader.show_publicly} eventPath={jamPath(jam)} />
    </div>
  );
}
