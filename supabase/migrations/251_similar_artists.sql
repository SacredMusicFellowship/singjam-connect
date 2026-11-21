-- The artists whose names are closest to one typed when adding a song, so the
-- server can use our own spelling ("Fleewood Mac" → "Fleetwood Mac") instead of
-- creating a misspelled artist. The app decides which, if any, is the same act.
create or replace function public.similar_artists(q text)
returns table (id uuid, name text)
language sql
stable
set search_path = public, extensions
as $$
  select a.id, a.name
  from public.artists a
  where coalesce(trim(q), '') <> ''
  order by similarity(lower(a.name), lower(trim(q))) desc, a.id
  limit 10;
$$;

revoke execute on function public.similar_artists(text) from public, anon, authenticated;
grant execute on function public.similar_artists(text) to service_role;
