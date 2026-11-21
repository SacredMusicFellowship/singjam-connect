"use client";

import { useEffect } from "react";

// Old links and internal navigation can still arrive at /<base>/<uuid>. Swap
// the address bar to the short code without a reload or a redirect round trip,
// so whatever someone copies to share is the short link.
export default function ShortUrl({ base, id, shortCode }: { base: "jam" | "set"; id: string; shortCode: string }) {
  useEffect(() => {
    const { pathname, search, hash } = window.location;
    if (pathname !== `/${base}/${id}`) return;
    window.history.replaceState(null, "", `/${base}/${shortCode}${search}${hash}`);
  }, [base, id, shortCode]);
  return null;
}
