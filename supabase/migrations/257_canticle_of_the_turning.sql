-- "Canticle of the Turning" was added as "canticle of the turning" before the
-- fill linked hymn texts and tunes. Hymnary prints Rory Cooney's text to one
-- tune, STAR OF COUNTY DOWN ("Irish melody", key e minor), so: the title's
-- casing, the text, the tune (Traditional, Cooney as arranger, Irish), Minor,
-- Irish as the music's culture and American as the words', no Folk genre (a
-- hymn sung to a folk tune; Sacred stays), and the recording under Rory Cooney
-- instead of one artist row naming the whole MusicBrainz credit.
insert into public.artists (name) values ('Rory Cooney') on conflict do nothing;

do $$
declare
  sid constant uuid := '79b97108-5e0e-4177-a1f1-ae735464b397';
  trio uuid := (select id from public.artists where name = 'Rory Cooney, Gary Daigle, & Theresa Donohoo');
  rory uuid := (select id from public.artists where name = 'Rory Cooney');
  tid uuid;
  uid uuid;
begin
  -- Production only: the song exists nowhere else.
  if not exists (select 1 from public.songs where id = sid and text_id is null and tune_id is null) then return; end if;

  insert into public.texts (title, slug, kind, first_line)
  values ('Canticle of the Turning', 'x', 'hymn', 'My soul cries out with a joyful shout')
  returning id into tid;
  insert into public.text_credits (text_id, person_id, role)
  select tid, id, 'author' from public.people where name = 'Rory Cooney';

  select id into uid from public.tunes where lower(name) = 'star of county down';
  if uid is null then
    insert into public.tunes (name, slug, meter, notes)
    values ('Star of County Down', 'x', 'Irregular', 'Irish folk melody ("The Star of the County Down").')
    returning id into uid;
    insert into public.tune_credits (tune_id, person_id, role) values
      (uid, (select id from public.people where name = 'Traditional'), 'composer'),
      (uid, (select id from public.people where name = 'Rory Cooney'), 'arranger');
    insert into public.tune_tags (tune_id, tag_id) select uid, id from public.tags where type = 'culture' and name = 'Irish';
  end if;

  update public.songs set
    title = 'Canticle of the Turning',
    text_id = tid,
    tune_id = uid,
    tonality = 'Minor',
    updated_at = now()
  where id = sid;

  update public.song_tags st set context = 'music' from public.tags t
  where st.song_id = sid and st.tag_id = t.id and st.context = 'general' and t.type = 'culture' and t.name = 'Irish';
  update public.song_tags st set context = 'lyrics' from public.tags t
  where st.song_id = sid and st.tag_id = t.id and st.context = 'general' and t.type = 'culture' and t.name = 'American';
  delete from public.song_tags st using public.tags t
  where st.song_id = sid and st.tag_id = t.id and t.type = 'genre' and t.name = 'Folk';

  if trio is not null and rory is not null then
    update public.song_recording_artists set artist_id = rory where song_id = sid and artist_id = trio;
    delete from public.artists a
    where a.id = trio and not exists (select 1 from public.song_recording_artists r where r.artist_id = a.id);
  end if;
end $$;
