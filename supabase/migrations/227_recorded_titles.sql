-- Migration 227: the title printed on a recording, when it isn't the song's.
--
-- Pete Seeger recorded "Low Bridge, Everybody Down" as "Erie Canal"; Bob Dylan
-- recorded "Hold On" as "Gospel Plow". song_recording_artists.recorded_title
-- keeps that title, so the hourly YouTube backfill searches with it and the
-- official-upload check accepts it (apps/web/lib/youtubeBackfill.ts). Most
-- also become alternate titles so search finds the song by them (not a medley
-- title, nor "Nelson's Blood", a different shanty sung to a related tune).
-- Data: the 33 such recordings found by the 2026-11-09 recording pass. Their
-- YouTube checks are cleared so the cron retries them with the record's title.

alter table public.song_recording_artists add column if not exists recorded_title text;
grant select (recorded_title) on public.song_recording_artists to anon, authenticated;

with v(song_id, artist, recorded_title, as_alternate) as (values
  ('ba20ae42-7474-4684-8042-8a9e8569de7a'::uuid, 'Robert Shaw Chorale', 'Ain''-a That Good News!', true),
  ('e29186f8-3710-4f30-8715-9fa498d149cd'::uuid, 'Nina Simone', 'Children Go Where I Send You', true),
  ('7ebb931e-5a2f-4f22-9a35-0f24e5df4311'::uuid, 'Johnny Cash', 'Do Lord', true),
  ('64545cd2-e1a8-4d00-a32b-cc53aed467ec'::uuid, 'Peter Pears, Benjamin Britten', 'The Salley Gardens', true),
  ('64545cd2-e1a8-4d00-a32b-cc53aed467ec'::uuid, 'Loreena McKennitt', 'Down by the Sally Gardens', true),
  ('a4a47ca4-1b7b-443b-ae34-98d665c32ca9'::uuid, 'Raffi', 'Five Little Frogs', true),
  ('8fb3df98-df45-4744-8134-84e4079bf2cb'::uuid, 'The Scaffold', 'Gin Gan Goolie', true),
  ('d580149c-2e11-41da-88e8-cca9a9411f20'::uuid, 'Mahalia Jackson', 'Keep Your Hand on the Plow', true),
  ('d580149c-2e11-41da-88e8-cca9a9411f20'::uuid, 'Bob Dylan', 'Gospel Plow', true),
  ('dd45445a-7886-4d55-9662-ecbdc0a32473'::uuid, 'The Staple Singers', 'I''m So Glad', true),
  ('83744a8e-59dc-45f2-992e-860a1fa5228a'::uuid, 'Elizabeth Mitchell', 'Peace Like a River', true),
  ('b50e756e-24ef-44e8-826e-793f0306d147'::uuid, 'The Carter Family', 'Lonesome Valley', true),
  ('b50e756e-24ef-44e8-826e-793f0306d147'::uuid, 'Joan Baez', 'Lonesome Valley', true),
  ('641b2a74-fc15-4ae4-bb05-f27512bfe1f1'::uuid, 'Bruce Springsteen', 'Eyes on the Prize', true),
  ('85cede22-8a78-4cbe-b8a4-cedffafa2ba2'::uuid, 'Sharon, Lois & Bram', 'Little Rabbit Foo Foo', true),
  ('4c32e66a-dc09-446d-a9e5-4c778bbe11da'::uuid, 'Bruce Springsteen', 'Erie Canal', true),
  ('4c32e66a-dc09-446d-a9e5-4c778bbe11da'::uuid, 'Pete Seeger', 'Erie Canal', true),
  ('1b1bede9-6439-4ee9-8904-6b4895d2249f'::uuid, 'Bryan Ferry', 'Lowlands Low', true),
  ('349ed373-b8e5-4ac3-80f6-25ac8f50b007'::uuid, 'Van Morrison', 'Marie''s Wedding', true),
  ('99134d53-0529-419f-9d24-f2d81cd36e58'::uuid, 'James Taylor', 'Oh, Susannah', true),
  ('99134d53-0529-419f-9d24-f2d81cd36e58'::uuid, 'Neil Young', 'Oh Susannah', true),
  ('e5e75fb1-da66-4fea-a481-e466b8a70368'::uuid, 'Sister Rosetta Tharpe', 'Up Above My Head, I Hear Music in the Air', true),
  ('d52131ec-222c-460e-8b74-b8152abf2d94'::uuid, 'Ernst Busch', 'Die Moorsoldaten', true),
  ('de5bdfa5-4a7a-4713-9f10-d9b2fa85198b'::uuid, 'The Wiggles', 'Ring-A-Ring o'' Rosy', true),
  ('caa62dcc-ff06-4208-9639-6f2f2dba2003'::uuid, 'Fisherman’s Friends', 'Nelson''s Blood', false),
  ('ec1c91d2-427b-430f-8dce-5f596e21f873'::uuid, 'Blind Willie Johnson', 'Let Your Light Shine on Me', true),
  ('5a349015-ed60-45b2-b886-a96dd51a85b6'::uuid, 'Pete Seeger', 'Shoo Fly', true),
  ('feef0e73-96ce-41d1-9bce-c4c88a9819d8'::uuid, 'Don McLean', 'Mountains O''Mourne', true),
  ('b7ce1e55-bc06-4a00-933c-234d88ac3b25'::uuid, 'Planxty', 'Raggle Taggle Gypsy / Tabhair Dom Do Lámh', false),
  ('a418b96d-88d9-4785-8429-21aaeec556cc'::uuid, 'Don Cornell', 'Heart of My Heart', true),
  ('ef477713-f386-472b-bdd9-b7a90346fac3'::uuid, 'Mitch Miller', 'The Children''s Marching Song (Nick Nack Paddy Whack)', true),
  ('0ff2a460-b2ad-40a8-817a-1c567731a357'::uuid, 'Bruce Springsteen', 'Jacob''s Ladder', true),
  ('7d3e857e-ba26-44c4-8aec-d1be94ac4cab'::uuid, 'Elvis Presley', 'By and By', true)
),
matched as (
  select sra.song_id, sra.artist_id, v.recorded_title, v.as_alternate
  from v
  join public.artists a on lower(a.name) = lower(v.artist)
  join public.song_recording_artists sra on sra.song_id = v.song_id and sra.artist_id = a.id
),
updated as (
  update public.song_recording_artists sra
  set recorded_title = m.recorded_title,
      youtube_checked_at = case when sra.youtube_ok is not true then null else sra.youtube_checked_at end
  from matched m
  where sra.song_id = m.song_id and sra.artist_id = m.artist_id
  returning sra.song_id
)
insert into public.song_alternate_titles (song_id, title)
select distinct m.song_id, m.recorded_title from matched m
join public.songs s on s.id = m.song_id
where m.as_alternate and lower(s.title) <> lower(m.recorded_title)
on conflict (song_id, title) do nothing;
