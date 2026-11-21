import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL ?? 'https://singjam.org';

// Mirrors web's lib/useAddressTimezone: tracks the venue's timezone as the host
// edits the address, via the web /api/timezone route. The pickers' wall clock is
// read in this zone, so saving must wait while `resolving` is true. The baseline
// is the saved address and its zone; a failed lookup, or a TBD location, keeps
// whatever zone was in force.
export function useAddressTimezone(
  address: string | null,
  baselineAddress: string | null,
  baselineTimezone: string | null
) {
  const fallback = baselineTimezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [timezone, setTimezone] = useState(fallback);
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    if (!address?.trim() || address === baselineAddress) {
      setTimezone((tz) => (address === baselineAddress ? fallback : tz));
      setResolving(false);
      return;
    }

    let cancelled = false;
    setResolving(true);
    const timer = setTimeout(async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const tz = await fetch(`${WEB_URL}/api/timezone?address=${encodeURIComponent(address)}`, {
        headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((b) => (b?.timezone as string | null) ?? null)
        .catch(() => null);
      if (cancelled) return;
      if (tz) setTimezone(tz);
      setResolving(false);
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [address, baselineAddress, fallback]);

  return { timezone, resolving };
}
