-- Migration 198: 197 picked each song's latest old slug by replaced_at, but 196
-- wrote a song's migrated former_slug and the slug it replaced in the same
-- transaction, so both share a timestamp and some songs got the older one.
-- song_slug_history has only ever been inserted into, so physical row order
-- (ctid) is insertion order: the last row per song is the slug 196 replaced.
update public.songs s
   set former_slug = h.slug
  from (
    select distinct on (song_id) song_id, slug
      from public.song_slug_history
     order by song_id, ctid desc
  ) h
 where h.song_id = s.id
   and s.former_slug is distinct from h.slug
   and h.slug <> s.slug;
