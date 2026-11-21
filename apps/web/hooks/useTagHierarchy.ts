import { useEffect, useState } from "react";
import { loadTagHierarchy, type TagHierarchy } from "@singjam/core";
import { supabaseBrowser } from "@/lib/supabase/client";

let cached: Promise<TagHierarchy> | null = null;

function loadHierarchy(): Promise<TagHierarchy> {
  cached ??= loadTagHierarchy(supabaseBrowser()).catch((e) => {
    cached = null;
    throw e;
  });
  return cached;
}

// Which tags sit under which (migration 202), loaded once per page load. Until it
// arrives — or if it fails — filters still work, just without parents covering
// their children.
export function useTagHierarchy(): TagHierarchy | null {
  const [hierarchy, setHierarchy] = useState<TagHierarchy | null>(null);
  useEffect(() => {
    let live = true;
    loadHierarchy().then((h) => { if (live) setHierarchy(h); }, () => {});
    return () => { live = false; };
  }, []);
  return hierarchy;
}
