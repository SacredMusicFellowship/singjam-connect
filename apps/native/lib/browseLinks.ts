import { TAG_PATH_TYPE, type BrowseKind } from '@singjam/core';

// Browse pages share web's addresses (/genres/rock, /people/john-newton); on
// native they live under /browse so one screen serves every kind, and a page's
// traditional songs (web /cultures/irish/traditional) are its ?traditional=1.
export function nativeBrowseHref(webPath: string): string {
  const trad = webPath.match(/^(\/[^/?]+\/[^/?]+)\/traditional$/);
  return trad ? `/browse${trad[1]}?traditional=1` : `/browse${webPath}`;
}

export function browseKindFromSegment(segment: string): BrowseKind | null {
  if (segment === 'people') return 'person';
  if (segment === 'artists') return 'artist';
  if (segment === 'shows') return 'show';
  if (segment === 'tunes') return 'tune';
  if (segment === 'texts') return 'text';
  if (segment === 'scripture') return 'scripture';
  return TAG_PATH_TYPE[segment] ?? null;
}
