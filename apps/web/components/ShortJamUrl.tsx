"use client";

import { useEffect } from "react";

// Old links and internal navigation still arrive at /jam/<uuid>. Swap the
// address bar to the short code without a reload or a redirect round trip,
// so whatever someone copies to share is the short link.
export default function ShortJamUrl({ jamId, shortCode }: { jamId: string; shortCode: string }) {
  useEffect(() => {
    const { pathname, search, hash } = window.location;
    if (pathname !== `/jam/${jamId}`) return;
    window.history.replaceState(null, "", `/jam/${shortCode}${search}${hash}`);
  }, [jamId, shortCode]);
  return null;
}
