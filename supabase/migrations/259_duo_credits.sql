-- Duo and group credits name their artists. "Kenny Rogers & Dolly Parton" is
-- one recording artist (one recording of Islands in the Stream) whose artists
-- are Kenny Rogers and Dolly Parton; each one's page lists the songs of the
-- credits they're in, and the search card counts them (search_browse_entities).
--
-- Data: the comma-joined credits that stood for a duet or a cast are renamed to
-- the credit as released and linked to their artists, and "Peter, Paul & Mary"
-- is merged into "Peter, Paul and Mary".

create table public.artist_members (
  group_id uuid not null references public.artists(id) on delete cascade,
  member_id uuid not null references public.artists(id) on delete cascade,
  position smallint not null default 0,
  primary key (group_id, member_id),
  check (group_id <> member_id)
);
create index artist_members_member_id_idx on public.artist_members (member_id);

alter table public.artist_members enable row level security;
create policy "read artist_members" on public.artist_members for select using (true);
create policy "admin write artist_members" on public.artist_members
  for all using (exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin'))
  with check (exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin'));
create policy "song editor write artist_members" on public.artist_members
  for all using (exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'song_editor'))
  with check (exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'song_editor'));

grant select on public.artist_members to anon;
grant select, insert, update, delete on public.artist_members to authenticated;
grant select, insert, update, delete on public.artist_members to service_role;

create or replace function public.search_browse_entities(q text, limit_n integer default 5)
returns table (kind text, key text, name text, song_count integer)
language plpgsql stable security definer
set search_path to 'public'
set plan_cache_mode to 'force_custom_plan'
as $$
#variable_conflict use_column
declare
  nq text := nullif(btrim(public.search_normalize(q)), '');
begin
  if nq is null then return; end if;
  return query
  with people_m as (
    select p.id, coalesce(p.slug, p.name) as key, p.name, n
    from public.people p, public.search_normalize(p.name) n
    where n like '%' || nq || '%' and p.name <> 'Traditional'
  ),
  artists_m as (
    select a.id, coalesce(a.slug, a.name) as key, a.name, n
    from public.artists a, public.search_normalize(a.name) n
    where n like '%' || nq || '%'
  ),
  shows_m as (
    select pr.id, pr.slug as key, pr.name, n
    from public.productions pr, public.search_normalize(pr.name) n
    where n like '%' || nq || '%'
  ),
  tunes_m as (
    select tu.id, tu.slug as key, tu.name, n
    from public.tunes tu, public.search_normalize(tu.name) n
    where tu.name is not null and n like '%' || nq || '%'
  ),
  -- A text matches on its title or any other title it goes by.
  texts_m as (
    select tx.id, tx.slug as key, tx.title as name, public.search_normalize(tx.title) as title_n, min(m.rank) as rank
    from public.texts tx
    cross join lateral (
      select tx.title union all select tt.title from public.text_titles tt where tt.text_id = tx.id
    ) t(title)
    cross join lateral (select public.search_normalize(t.title) as n) nn
    cross join lateral (select case when nn.n = nq then 0 when nn.n like nq || '%' or nn.n like '% ' || nq || '%' then 1 else 2 end as rank) m
    where nn.n like '%' || nq || '%'
    group by tx.id, tx.slug, tx.title
  ),
  candidates as (
    select 'person'::text as kind, m.key, m.name, m.n, null::int as rank, c.song_count, null::text as only_title
    from people_m m
    join (
      select w.person_id, count(distinct w.song_id)::int as song_count
      from (select sc.person_id, sc.song_id from public.song_composers sc
            union all select sl.person_id, sl.song_id from public.song_lyricists sl) w
      where w.person_id in (select id from people_m)
      group by w.person_id
    ) c on c.person_id = m.id
    union all
    select 'artist', m.key, m.name, m.n, null, c.song_count, null
    from artists_m m
    join (
      -- An artist's own recordings and those of the duo and group credits it's in.
      select x.artist_id, count(distinct sra.song_id)::int as song_count
      from (select am.id as artist_id, am.id as credit_id from artists_m am
            union all
            select mem.member_id, mem.group_id from public.artist_members mem
            where mem.member_id in (select id from artists_m)) x
      join public.song_recording_artists sra on sra.artist_id = x.credit_id
      group by x.artist_id
    ) c on c.artist_id = m.id
    union all
    select 'show', m.key, m.name, m.n, null, c.song_count, null
    from shows_m m
    join (
      select sp.production_id, count(distinct sp.song_id)::int as song_count
      from public.song_productions sp
      where sp.production_id in (select id from shows_m)
      group by sp.production_id
    ) c on c.production_id = m.id
    union all
    select 'tune', m.key, m.name, m.n, null, c.song_count, c.only_title
    from tunes_m m
    join (
      select s.tune_id, count(*)::int as song_count, public.search_normalize(min(s.title)) as only_title
      from public.songs s
      where s.tune_id in (select id from tunes_m)
      group by s.tune_id
    ) c on c.tune_id = m.id
    union all
    select 'text', m.key, m.name, m.title_n, m.rank, c.song_count, c.only_title
    from texts_m m
    join (
      select s.text_id, count(*)::int as song_count, public.search_normalize(min(s.title)) as only_title
      from public.songs s
      where s.text_id in (select id from texts_m)
      group by s.text_id
    ) c on c.text_id = m.id
  )
  select c.kind, c.key, c.name, c.song_count
  from candidates c
  cross join lateral (
    select coalesce(c.rank, case when c.n = nq then 0 when c.n like nq || '%' or c.n like '% ' || nq || '%' then 1 else 2 end) as rank
  ) r
  where not (c.song_count = 1 and c.only_title = c.n)
  order by r.rank, c.song_count desc, c.name, c.kind, c.key
  limit least(greatest(limit_n, 0), 20);
end;
$$;

revoke execute on function public.search_browse_entities(text, integer) from public;
grant execute on function public.search_browse_entities(text, integer) to anon, authenticated, service_role;

-- The credits, as released, and their artists in credit order.
do $$
declare
  c record;
  gid uuid;
  mid uuid;
  i int;
begin
  for c in select * from (values
    ('Dolly Parton, Kenny Rogers', 'Kenny Rogers & Dolly Parton', array['Kenny Rogers', 'Dolly Parton']),
    ('Marvin Gaye, Tammi Terrell', 'Marvin Gaye & Tammi Terrell', array['Marvin Gaye', 'Tammi Terrell']),
    ('Ella Fitzgerald, Count Basie', 'Ella Fitzgerald & Count Basie', array['Ella Fitzgerald', 'Count Basie']),
    ('Gillian Welch, Alison Krauss', 'Alison Krauss & Gillian Welch', array['Alison Krauss', 'Gillian Welch']),
    ('Mark Ronson, Amy Winehouse', 'Mark Ronson feat. Amy Winehouse', array['Mark Ronson', 'Amy Winehouse']),
    ('Blackstreet, Dr. Dre', 'Blackstreet feat. Dr. Dre', array['Blackstreet', 'Dr. Dre']),
    ('Regina Spektor, Ben Folds', 'Regina Spektor feat. Ben Folds', array['Regina Spektor', 'Ben Folds']),
    ('Regina Spektor, Only Son', 'Regina Spektor feat. Only Son', array['Regina Spektor', 'Only Son']),
    ('Peter Pears, Benjamin Britten', 'Peter Pears & Benjamin Britten', array['Peter Pears', 'Benjamin Britten']),
    ('Philip Quast, Colm Wilkinson', 'Philip Quast & Colm Wilkinson', array['Philip Quast', 'Colm Wilkinson']),
    ('Raffi, Ken Whiteley', 'Raffi & Ken Whiteley', array['Raffi', 'Ken Whiteley']),
    ('Savannah Outen, Jake Coco', 'Savannah Outen & Jake Coco', array['Savannah Outen', 'Jake Coco']),
    ('Oscar Isaac, Marcus Mumford, Punch Brothers', 'Oscar Isaac & Marcus Mumford', array['Oscar Isaac', 'Marcus Mumford']),
    ('Sarah McLachlan, Indigo Girls, Jewel', 'Sarah McLachlan, Indigo Girls & Jewel', array['Sarah McLachlan', 'Indigo Girls', 'Jewel']),
    ('Celeste Holm, Lesley Ann Warren, Celeste Holm', 'Celeste Holm & Lesley Ann Warren', array['Celeste Holm', 'Lesley Ann Warren']),
    ('Alexia Khadime, Christine Allado, Mia Lakha, Luke Brady', 'Alexia Khadime, Christine Allado, Mia Lakha & Luke Brady',
      array['Alexia Khadime', 'Christine Allado', 'Mia Lakha', 'Luke Brady']),
    ('Topol, Norma Crane, Leonard Frey, Molly Picon, Paul Mann and the Fiddler on the Roof Motion Picture Chorus', 'Topol & Norma Crane', array['Topol', 'Norma Crane']),
    ('Zero Mostel, Maria Karnilova & Original Broadway Cast', 'Zero Mostel & Maria Karnilova', array['Zero Mostel', 'Maria Karnilova'])
  ) v(old_name, new_name, members)
  loop
    select id into gid from public.artists where name = c.old_name;
    continue when gid is null or exists (select 1 from public.artists where name = c.new_name);
    update public.artists set name = c.new_name where id = gid;
    update public.songs set display_artist = replace(display_artist, c.old_name, c.new_name), updated_at = now()
    where display_artist like '%' || c.old_name || '%';
    for i in 1 .. array_length(c.members, 1) loop
      insert into public.artists (name) values (c.members[i]) on conflict (name) do nothing;
      select id into mid from public.artists where name = c.members[i];
      insert into public.artist_members (group_id, member_id, position) values (gid, mid, i - 1) on conflict do nothing;
    end loop;
  end loop;
end $$;

-- One Peter, Paul and Mary.
do $$
declare
  keep uuid := (select id from public.artists where name = 'Peter, Paul and Mary');
  dup uuid := (select id from public.artists where name = 'Peter, Paul & Mary');
begin
  if keep is null or dup is null then return; end if;
  update public.song_recording_artists r set artist_id = keep
  where r.artist_id = dup and not exists (select 1 from public.song_recording_artists x where x.song_id = r.song_id and x.artist_id = keep);
  delete from public.song_recording_artists where artist_id = dup;
  update public.songs set display_artist = replace(display_artist, 'Peter, Paul & Mary', 'Peter, Paul and Mary'), updated_at = now()
  where display_artist like '%Peter, Paul & Mary%';
  delete from public.artists where id = dup;
end $$;
