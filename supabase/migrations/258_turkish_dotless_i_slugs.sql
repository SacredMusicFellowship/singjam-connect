-- Migration 258: slugs spell the Turkish dotless ı as i.
--
-- ı has no decomposed form, so the slug functions dropped it: a song by Niyazi
-- Mısri got "niyazi-msri", and Nice Bir Uyursun Uyanmaz Mısın "uyanmaz-msn".
-- tag_slug (tags, texts, tunes, collections, people, artists, productions) and
-- song_slug_base (songs, as in 202) now read ı as i before stripping accents.
-- Rows whose names hold ı get their slugs again; a song's old slug stays in
-- song_slug_history, so its old link still opens it.

create or replace function public.tag_slug(p_name text)
returns text
language sql
immutable
set search_path = public
as $$
  select trim(both '-' from regexp_replace(
    lower(regexp_replace(normalize(translate(replace(coalesce(p_name, ''), '&', ' and '), 'ı', 'i'), NFKD), '[̀-ͯ]', '', 'g')),
    '[^a-z0-9]+', '-', 'g'));
$$;

-- song_slug_base: as in 202, with ı read as i.
create or replace function public.song_slug_base(p_song_id uuid, p_title text)
returns text
language sql
stable
set search_path = public
as $$
  select nullif(
    regexp_replace(
      trim(regexp_replace(
        lower(regexp_replace(regexp_replace(normalize(translate(concat_ws(' ',
          p_title,
          (select string_agg(w.name, ' ' order by lower(w.name))
             from (
               select distinct on (lower(p.name)) p.name
                 from (
                   select person_id from public.song_composers where song_id = p_song_id
                   union
                   select person_id from public.song_lyricists where song_id = p_song_id
                 ) credit
                 join public.people p on p.id = credit.person_id
                order by lower(p.name)
                limit 3
             ) w),
          (select t.name
             from public.song_tags st
             join public.tags t on t.id = st.tag_id
            where st.song_id = p_song_id and st.context = 'music' and t.type in ('culture', 'community')
            order by t.name
            limit 1)
        ), 'ı', 'i'), NFKD), '[̀-ͯ]', '', 'g'), '[-/‐-―]', ' ', 'g')),
        '[^a-z0-9[:space:]]', '', 'g'
      )),
      '\s+', '-', 'g'
    ),
    ''
  );
$$;

do $$
declare
  r record;
  tbl text;
begin
  update public.tags set slug = public.tag_slug(name) where name like '%ı%';

  foreach tbl in array array['people', 'artists', 'productions'] loop
    for r in execute format('select id, name from public.%I where name like ''%%ı%%''', tbl) loop
      execute format('update public.%I set slug = public.next_free_slug(%L, public.tag_slug($1), $2) where id = $2', tbl, tbl) using r.name, r.id;
    end loop;
  end loop;

  for r in select id, title from public.texts where title like '%ı%' loop
    update public.texts set slug = public.next_free_slug('texts', public.tag_slug(r.title), r.id) where id = r.id;
  end loop;
  for r in select id, name from public.tunes where name like '%ı%' loop
    update public.tunes set slug = public.next_free_slug('tunes', public.tag_slug(r.name), r.id) where id = r.id;
  end loop;

  for r in
    select s.id from public.songs s
    where s.title like '%ı%'
       or exists (select 1 from public.song_composers c join public.people p on p.id = c.person_id where c.song_id = s.id and p.name like '%ı%')
       or exists (select 1 from public.song_lyricists l join public.people p on p.id = l.person_id where l.song_id = s.id and p.name like '%ı%')
       or exists (select 1 from public.song_tags st join public.tags t on t.id = st.tag_id
                   where st.song_id = s.id and st.context = 'music' and t.name like '%ı%')
  loop
    perform public.apply_song_slug(r.id);
  end loop;
end $$;
