import type { TagType } from "./songTags";

// Addresses of the browse pages (migration 205), shared so web and native link
// to the same places.
export const TAG_TYPE_PATH: Record<TagType, string> = {
  genre: "genres",
  form: "forms",
  occasion: "occasions",
  community: "communities",
  culture: "cultures",
  language: "languages",
  theme: "themes",
  mode: "modes",
  rhythm: "rhythms",
};

export const TAG_PATH_TYPE: Record<string, TagType> = Object.fromEntries(
  Object.entries(TAG_TYPE_PATH).map(([type, path]) => [path, type as TagType])
) as Record<string, TagType>;

export type BrowseKind = TagType | "person" | "artist" | "show" | "tune" | "text";

// `traditional` narrows a page to its traditional songs ("Trad. · American"
// on a song card opens the American page that way).
export function browsePath(kind: BrowseKind, slug: string, opts: { traditional?: boolean } = {}): string {
  const base = kind === "person" ? "people" : kind === "artist" ? "artists" : kind === "show" ? "shows"
    : kind === "tune" ? "tunes" : kind === "text" ? "texts" : TAG_TYPE_PATH[kind];
  return `/${base}/${encodeURIComponent(slug)}${opts.traditional ? "?traditional=1" : ""}`;
}

export const SHOW_MEDIUM_LABEL: Record<string, string> = {
  stage: "Stage musical",
  film: "Film",
  animated: "Animated film",
  tv: "TV",
  game: "Video game",
};
