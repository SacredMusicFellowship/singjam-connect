-- Migration 206: song counts for the /browse hub. A tag counts the songs tagged
-- with it or anything below it (Americana includes Country, Bluegrass…), each
-- song once, matching the filters' counts.
create or replace function public.tag_song_counts()
returns table (tag_id uuid, songs int)
language sql
stable
set search_path = public
as $$
  with recursive below(ancestor, tag_id) as (
    select id, id from public.tags
    union
    select b.ancestor, r.tag_id from below b join public.tag_relations r on r.related_tag_id = b.tag_id and r.kind = 'parent'
  )
  select b.ancestor, count(distinct st.song_id)::int
  from below b
  join public.song_tags st on st.tag_id = b.tag_id
  group by b.ancestor;
$$;
grant execute on function public.tag_song_counts() to anon, authenticated, service_role;
