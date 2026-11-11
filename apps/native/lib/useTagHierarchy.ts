import { useEffect, useState } from 'react';
import { loadTagHierarchy, type TagHierarchy } from '@singjam/core';
import { supabase } from '@/lib/supabase';

let cached: Promise<TagHierarchy> | null = null;

function loadHierarchy(): Promise<TagHierarchy> {
  cached ??= loadTagHierarchy(supabase).catch((e) => {
    cached = null;
    throw e;
  });
  return cached;
}

// Which tags sit under which (migration 202), loaded once per app session — the
// same as web's hook. Filters work without it, just without parents covering children.
export function useTagHierarchy(): TagHierarchy | null {
  const [hierarchy, setHierarchy] = useState<TagHierarchy | null>(null);
  useEffect(() => {
    let live = true;
    loadHierarchy().then((h) => { if (live) setHierarchy(h); }, () => {});
    return () => { live = false; };
  }, []);
  return hierarchy;
}
