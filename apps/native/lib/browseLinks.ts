import { TAG_PATH_TYPE, type BrowseKind } from '@singjam/core';

// Browse pages share web's addresses (/genres/rock, /people/john-newton); on
// native they live under /browse so one screen serves every kind.
export function nativeBrowseHref(webPath: string): string {
  return `/browse${webPath}`;
}

export function browseKindFromSegment(segment: string): BrowseKind | null {
  if (segment === 'people') return 'person';
  if (segment === 'artists') return 'artist';
  if (segment === 'shows') return 'show';
  if (segment === 'tunes') return 'tune';
  if (segment === 'texts') return 'text';
  return TAG_PATH_TYPE[segment] ?? null;
}
