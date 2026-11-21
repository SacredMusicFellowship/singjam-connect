import { zoneAbbreviation } from "@singjam/core";

export default function JamTimezoneNote({
  timezone,
  resolving,
  startsAt,
}: {
  timezone: string | null;
  resolving: boolean;
  startsAt: string | null;
}) {
  if (resolving) return <p className="text-xs text-zinc-400">Checking the venue&apos;s time zone…</p>;
  if (!timezone) return null;
  return (
    <p className="text-xs text-zinc-400">
      Times are in {zoneAbbreviation(timezone, startsAt ? new Date(startsAt) : new Date())}
    </p>
  );
}
