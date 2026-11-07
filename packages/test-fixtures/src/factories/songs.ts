import { generateSlug, MUSICAL_KEYS } from "@singjam/core";
import type { FixtureContext } from "../context";
import { ARTISTS, METERS, SONGS, SONGWRITERS } from "../names";
import type { ArtistRow, PersonRow, SongComposerRow, SongGenreRow, SongRecordingArtistRow, SongRow } from "../types";

export type SongCatalog = {
  people: PersonRow[];
  artists: ArtistRow[];
  songs: SongRow[];
  songComposers: SongComposerRow[];
  songRecordingArtists: SongRecordingArtistRow[];
  songGenres: SongGenreRow[];
};

export function buildSongCatalog(ctx: FixtureContext): SongCatalog {
  const { rng } = ctx;
  const people = SONGWRITERS.map((name) => ({ id: ctx.id("person", name), name }));
  const artists = ARTISTS.map((name) => ({ id: ctx.id("artist", name), name }));

  const catalog: SongCatalog = { people, artists, songs: [], songComposers: [], songRecordingArtists: [], songGenres: [] };

  SONGS.forEach((spec, index) => {
    const id = ctx.id("song", spec.title);
    const composers = rng.sample(people, rng.int(1, 2));
    const artist = artists[index % artists.length];
    const year = rng.int(1958, 2024);

    catalog.songs.push({
      id,
      title: spec.title,
      slug: generateSlug(spec.title, composers.map((c) => c.name)),
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
    catalog.songGenres.push({ song_id: id, genre_name: spec.genre });
  });

  return catalog;
}
