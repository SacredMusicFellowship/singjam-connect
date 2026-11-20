-- What the person adding a song told us beyond its title and artist (all
-- optional, see core songAddHints): how they know it ("recording",
-- "traditional", "hymn", "show"), how they remember it starting, and the tag
-- names of the jam it was added for. Enrichment and later editor reviews read
-- them as hints; none is copied into the song as a fact on its own.
-- Covered by the table-level grants on songs; holds no names of people or jams.
alter table public.songs add column if not exists add_hints jsonb;
comment on column public.songs.add_hints is
  'Hints from the person who added the song: {known_as, first_line, context[]}. Read by enrichment; never shown as song data.';
