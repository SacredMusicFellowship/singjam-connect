"use client";

import { useEffect, useState } from "react";

// Tracks the venue's timezone as the host edits the address. The typed date and
// times are read in this zone, so saving must wait until it is non-null and not
// `resolving`. The baseline is the saved (or copied) address and its zone; a
// failed lookup, or a TBD location, keeps whatever zone was in force. With no
// baseline zone that is the browser's, read after mount because the server
// render has no browser to ask.
export function useAddressTimezone(
  address: string | null,
  baselineAddress: string | null,
  baselineTimezone: string | null
) {
  const [timezone, setTimezone] = useState<string | null>(baselineTimezone);
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    const fallback = baselineTimezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!address?.trim() || address === baselineAddress) {
      setTimezone((tz) => (address === baselineAddress ? fallback : tz ?? fallback));
      setResolving(false);
      return;
    }

    let cancelled = false;
    setResolving(true);
    const timer = setTimeout(async () => {
      const tz = await fetch(`/api/timezone?address=${encodeURIComponent(address)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((b) => (b?.timezone as string | null) ?? null)
        .catch(() => null);
      if (cancelled) return;
      setTimezone((prev) => tz ?? prev ?? fallback);
      setResolving(false);
    }, 600);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [address, baselineAddress, baselineTimezone]);

  return { timezone, resolving };
}
