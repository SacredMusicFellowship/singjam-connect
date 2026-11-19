import { MUSICAL_KEYS } from "@singjam/core";
import type { FixtureContext } from "../context";
import { ARTISTS, METERS, SONGS, SONGWRITERS, TAGS } from "../names";
import type { ArtistRow, PersonRow, SongComposerRow, SongTagRow, SongRecordingArtistRow, SongRow } from "../types";

export type SongCatalog = {
  people: PersonRow[];
  artists: ArtistRow[];
  songs: SongRow[];
  songComposers: SongComposerRow[];
  songRecordingArtists: SongRecordingArtistRow[];
  songTags: SongTagRow[];
};

// The slug the database gives a song (song_slug_base, migrations 196 and 202): the title, then up to
// three writers A–Z, accents dropped, hyphens and slashes as spaces, only letters, digits and
// spaces kept, spaces as hyphens. The fixtures have no lyricists or music-culture tags, so writers
// are the composers. The database sets it on insert; this predicts it so tests can link to songs.
export function songSlug(title: string, writers: string[]): string {
  const unique = [...new Map(writers.map((w) => [w.toLowerCase(), w])).values()]
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
    .slice(0, 3);
  return [title, ...unique]
    .join(" ")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[-/\u2010-\u2015]/g, " ")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

export function buildSongCatalog(ctx: FixtureContext): SongCatalog {
  const { rng } = ctx;
  const people = SONGWRITERS.map((name) => ({ id: ctx.id("person", name), name }));
  const artists = ARTISTS.map((name) => ({ id: ctx.id("artist", name), name }));

  const catalog: SongCatalog = { people, artists, songs: [], songComposers: [], songRecordingArtists: [], songTags: [] };

  SONGS.forEach((spec, index) => {
    const id = ctx.id("song", spec.title);
    const composers = rng.sample(people, rng.int(1, 2));
    const artist = artists[index % artists.length];
    const year = rng.int(1958, 2024);

    catalog.songs.push({
      id,
      title: spec.title,
      slug: songSlug(spec.title, composers.map((c) => c.name)),
      display_artist: artist.name,
      first_line: spec.firstLine,
      year,
      tonality: rng.pick(MUSICAL_KEYS),
      meter: rng.pick(METERS),
      vibe: spec.vibe,
      // No links to real recordings or charts.
      youtube_url: null,
      chord_chart_url: null,
    });
    for (const person of composers) catalog.songComposers.push({ song_id: id, person_id: person.id });
    catalog.songRecordingArtists.push({ song_id: id, artist_id: artist.id, year, position: 0 });
    catalog.songTags.push({ song_id: id, tag_type: TAGS[spec.genre], tag_name: spec.genre });
  });

  return catalog;
}
