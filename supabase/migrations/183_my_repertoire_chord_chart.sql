-- Migration 183: my_repertoire() also returns each song's chord chart link, so
-- My Repertoire rows can show the same Ultimate Guitar "Chords" link as the set
-- list. The return type gains a column, which create or replace can't do, so the
-- function is dropped and recreated (in the migration's transaction) with its
-- grants restated. Older clients ignore the extra column.

drop function if exists public.my_repertoire();

create function public.my_repertoire()
returns table (
  song_id        uuid,
  confidence     text,
  key_note       text,
  updated_at     timestamptz,
  title          text,
  slug           text,
  display_artist text,
  first_line     text,
  hook           text,
  notes          text,
  vibe           text,
  tonality       text,
  meter          text,
  year           int,
  composers      text[],
  cultures       text[],
  productions    text[],
  genres         text[],
  languages      text[],
  themes         text[],
  popularity     bigint,
  chord_chart_url text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    us.song_id,
    us.confidence,
    us.key_note,
    us.updated_at,
    s.title,
    s.slug,
    s.display_artist,
    s.first_line,
    s.hook,
    s.notes,
    s.vibe,
    s.tonality,
    s.meter,
    least(s.year_written, (select min(sra.year) from public.song_recording_artists sra where sra.song_id = s.id)) as year,
    coalesce((
      select array_agg(name order by name) from (
        select p.name from public.song_composers sc join public.people p on p.id = sc.person_id where sc.song_id = s.id
        union
        select p.name from public.song_lyricists sl join public.people p on p.id = sl.person_id where sl.song_id = s.id
      ) names
    ), '{}') as composers,
    coalesce((select array_agg(c.name) from public.song_cultures scu join public.cultures c on c.id = scu.culture_id where scu.song_id = s.id), '{}') as cultures,
    coalesce((select array_agg(pr.name) from public.song_productions sp join public.productions pr on pr.id = sp.production_id where sp.song_id = s.id), '{}') as productions,
    coalesce((select array_agg(g.name) from public.song_genres sg join public.genres g on g.id = sg.genre_id where sg.song_id = s.id), '{}') as genres,
    coalesce((select array_agg(l.name) from public.song_languages sl2 join public.languages l on l.id = sl2.language_id where sl2.song_id = s.id), '{}') as languages,
    coalesce((select array_agg(t.name) from public.song_themes st join public.themes t on t.id = st.theme_id where st.song_id = s.id), '{}') as themes,
    (select count(*) from public.user_songs us2 where us2.song_id = us.song_id) as popularity,
    s.chord_chart_url
  from public.user_songs us
  join public.songs s on s.id = us.song_id
  where us.user_id = (select auth.uid())
  order by s.title asc, us.song_id asc;
$$;

revoke execute on function public.my_repertoire() from public, anon;
grant execute on function public.my_repertoire() to authenticated, service_role;
