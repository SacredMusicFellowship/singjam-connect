-- Migration 217: the Barberpole Cat songbooks, and a line under the title for
-- songs with writers but no recording.
--
-- 1. The Barbershop Harmony Society's Barberpole Cat Songbook: Vol. I (12 songs
--    chosen by member vote in 1987, plus two tags) and Vol. II (12 songs, 2015),
--    the shared repertoire barbershoppers sing anywhere. Membership comes from
--    the wave-1 seeding research (singers.com, barbershop.org, Wikipedia); the
--    printed numbers aren't in those sources, so entries carry no number.
-- 2. byline(): a song known by its recording but with no recording artist (a
--    1900s parlour song added by its writers) shows its writers instead of nothing.

insert into public.collections (slug, name, edition, kind, publisher, year, notes)
values
  ('barberpole-cat-songbook-vol-i', 'Barberpole Cat Songbook', 'Vol. I', 'songbook', 'Barbershop Harmony Society', 1987,
   'Twelve songs chosen by member vote in 1987, plus two tags: the core repertoire any barbershopper can sing in a pickup quartet.'),
  ('barberpole-cat-songbook-vol-ii', 'Barberpole Cat Songbook', 'Vol. II', 'songbook', 'Barbershop Harmony Society', 2015,
   'Twelve more songs for pickup quartets, published in 2015.')
on conflict (slug) do nothing;

insert into public.collection_entries (collection_id, title_as_printed, song_id)
select c.id, v.printed, s.id
from (values
  ('My Wild Irish Rose', 'My Wild Irish Rose'),
  ('Wait ''Till the Sun Shines, Nellie', 'Wait ''Till the Sun Shines, Nellie'),
  ('Sweet and Lovely (That''s What You Are to Me)', 'Sweet and Lovely (That''s What You Are to Me)'),
  ('Down Our Way', 'Down Our Way'),
  ('Honey / Little ''Lize Medley', 'Honey / Little ''Lize Medley'),
  ('Let Me Call You Sweetheart', 'Let Me Call You Sweetheart'),
  ('Sweet, Sweet Roses of Morn', 'Sweet, Sweet Roses of Morn'),
  ('Shine On Me', 'Shine On Me'),
  ('The Story of the Rose (Heart of My Heart)', 'The Story of the Rose (Heart of My Heart)'),
  ('(You''re the Flower of My Heart,) Sweet Adeline', '(You''re the Flower of My Heart,) Sweet Adeline'),
  ('Down by the Old Mill Stream', 'Down by the Old Mill Stream'),
  ('You Tell Me Your Dream', 'You Tell Me Your Dream'),
  ('Give Me Your Hand (tag)', 'Give Me Your Hand'),
  ('Ring, Ring de Banjo', 'Ring, Ring de Banjo')
) v(printed, title)
join public.collections c on c.slug = 'barberpole-cat-songbook-vol-i'
join lateral (select id from public.songs where title = v.title order by created_at limit 1) s on true
where not exists (select 1 from public.collection_entries e where e.collection_id = c.id and e.song_id = s.id);

insert into public.collection_entries (collection_id, title_as_printed, song_id)
select c.id, v.printed, s.id
from (values
  ('After You''ve Gone', 'After You''ve Gone'),
  ('Bright Was the Night', 'Bright Was the Night'),
  ('Caroline', 'Caroline'),
  ('(When It''s) Darkness on the Delta', '(When It''s) Darkness on the Delta'),
  ('Drivin'' Me Crazy', 'Drivin'' Me Crazy'),
  ('From the First Hello to the Last Goodbye', 'From the First Hello to the Last Goodbye'),
  ('Goodbye, My Coney Island Baby', 'Goodbye, My Coney Island Baby'),
  ('Hello Mary Lou (Goodbye Heart)', 'Hello Mary Lou (Goodbye Heart)'),
  ('I Don''t Know Why (I Just Do)', 'I Don''t Know Why (I Just Do)'),
  ('I''ve Been Working on the Railroad', 'I''ve Been Workin'' on the Railroad'),
  ('Lida Rose / Will I Ever Tell You', 'Lida Rose / Will I Ever Tell You'),
  ('Over the Rainbow', 'Over the Rainbow')
) v(printed, title)
join public.collections c on c.slug = 'barberpole-cat-songbook-vol-ii'
join lateral (select id from public.songs where title = v.title order by created_at limit 1) s on true
where not exists (select 1 from public.collection_entries e where e.collection_id = c.id and e.song_id = s.id);


create or replace function public.byline(s public.songs)
returns text
language sql
stable
set search_path = public
as $$
  with recursive christian as (
    select id from public.tags where type = 'community' and name = 'Christian'
    union
    select r.tag_id from public.tag_relations r join christian c on r.related_tag_id = c.id where r.kind = 'parent'
  ),
  writers as (
    select distinct p.name
    from (
      select person_id from public.song_composers where song_id = s.id
      union
      select person_id from public.song_lyricists where song_id = s.id
    ) c
    join public.people p on p.id = c.person_id
  ),
  facts as (
    select
      exists (select 1 from writers where lower(name) = 'traditional') as traditional,
      exists (
        select 1 from public.song_tags st join public.tags t on t.id = st.tag_id
        where st.song_id = s.id and t.type = 'form'
          and t.name in ('Hymn', 'Nigun', 'Zemer', 'Piyyut', 'Psalm setting', 'Liturgical setting', 'Chant', 'Lined hymn', 'Carol')
      ) as traditional_form,
      (select string_agg(name, ', ' order by name) from writers where lower(name) <> 'traditional') as named,
      -- Where it comes from: a non-Christian community (Jewish), then a
      -- culture (the more specific one first: African American over
      -- American), then a Christian church community; music context first.
      (select t.name from public.song_tags st join public.tags t on t.id = st.tag_id
        where st.song_id = s.id and t.type in ('community', 'culture')
        order by
          case when t.type = 'community' and t.id not in (select id from christian) then 0
               when t.type = 'culture' then 1
               else 2 end,
          t.is_top_level, (st.context = 'music') desc, t.name
        limit 1) as origin
  )
  select case
    when coalesce(s.known_by_recording, not (f.traditional or f.traditional_form)) then coalesce(nullif(trim(s.display_artist), ''), f.named)
    else coalesce(f.named, 'Traditional' || coalesce(' · ' || f.origin, ''))
  end
  from facts f;
$$;
grant execute on function public.byline(public.songs) to anon, authenticated, service_role;
