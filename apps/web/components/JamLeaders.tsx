import Image from "next/image";
import Link from "next/link";
import type { PublicJamLeader } from "@/lib/jamLeaders";

// Who is leading the music. Public on purpose: it is a reason to come, and a
// way into each leader's profile and repertoire. A leader can take themselves
// off it (show_publicly) without stepping down.
export default function JamLeaders({ leaders }: { leaders: PublicJamLeader[] }) {
  if (leaders.length === 0) return null;
  return (
    <div>
      <h2 className="border-b border-zinc-200 pb-2 text-sm font-semibold text-zinc-700">Leading</h2>
      <ul className="mt-3 space-y-2">
        {leaders.map((l) => {
          const avatar = (
            <span className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-amber-100 text-xs font-medium text-amber-700">
              {l.avatar_url ? (
                <Image src={l.avatar_url} alt="" fill sizes="32px" className="object-cover" />
              ) : (
                l.name[0]?.toUpperCase()
              )}
            </span>
          );
          return (
            <li key={l.id}>
              {l.username ? (
                <Link href={`/u/${l.username}`} className="flex items-center gap-3 text-sm font-medium text-zinc-900 hover:underline">
                  {avatar}
                  <span className="truncate">{l.name}</span>
                </Link>
              ) : (
                <span className="flex items-center gap-3 text-sm font-medium text-zinc-900">
                  {avatar}
                  <span className="truncate">{l.name}</span>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
