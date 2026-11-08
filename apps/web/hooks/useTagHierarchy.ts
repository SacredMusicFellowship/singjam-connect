import { useEffect, useState } from "react";
import { buildTagHierarchy, fetchAllRows, type TagGraphRow, type TagHierarchy, type TagRelationRow } from "@singjam/core";
import { supabaseBrowser } from "@/lib/supabase/client";

let cached: Promise<TagHierarchy> | null = null;

function loadHierarchy(): Promise<TagHierarchy> {
  const supabase = supabaseBrowser();
  cached ??= Promise.all([
    fetchAllRows<TagGraphRow>((from, to) => supabase.from("tags").select("id, name, type, is_top_level").order("id").range(from, to)),
    fetchAllRows<TagRelationRow>((from, to) =>
      supabase.from("tag_relations").select("tag_id, related_tag_id, kind").eq("kind", "parent").order("tag_id").order("related_tag_id").range(from, to)
    ),
  ])
    .then(([tags, relations]) => buildTagHierarchy(tags, relations))
    .catch((e) => {
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
