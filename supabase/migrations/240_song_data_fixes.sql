-- Data fixes from a catalogue sweep (2026-11-18). Each update is keyed by id
-- and only applies while the row still holds the wrong value, so the file does
-- nothing on databases without these rows.

-- "Robyn" by "Call your girlfriend": title and artist were swapped when it was
-- added. The artist row was only used by this song, so it is renamed (its
-- slug follows). Writers per the song's Wikipedia article; the Genius link was
-- confirmed by the new Genius lookup.
update public.artists set name = 'Robyn'
where id = 'e5108b49-41e3-48e4-8d4f-9d6a99463bbf' and name = 'Call your girlfriend';

update public.songs set
  title = 'Call Your Girlfriend',
  display_artist = 'Robyn',
  genius_url = coalesce(genius_url, 'https://genius.com/Robyn-call-your-girlfriend-lyrics'),
  updated_at = now()
where id = 'ec7ec406-f2cd-4588-a52f-60dec5ab4cd1' and title = 'Robyn';

insert into public.people (name)
select n from unnest(array['Robyn', 'Klas Åhlund', 'Alexander Kronlund']) as n
where exists (select 1 from public.songs where id = 'ec7ec406-f2cd-4588-a52f-60dec5ab4cd1')
  and not exists (select 1 from public.people p where p.name = n);

insert into public.song_composers (song_id, person_id)
select 'ec7ec406-f2cd-4588-a52f-60dec5ab4cd1', p.id from public.people p
where p.name in ('Robyn', 'Klas Åhlund', 'Alexander Kronlund')
  and exists (select 1 from public.songs where id = 'ec7ec406-f2cd-4588-a52f-60dec5ab4cd1')
  and not exists (select 1 from public.song_composers where song_id = 'ec7ec406-f2cd-4588-a52f-60dec5ab4cd1');

insert into public.song_lyricists (song_id, person_id)
select 'ec7ec406-f2cd-4588-a52f-60dec5ab4cd1', p.id from public.people p
where p.name in ('Robyn', 'Klas Åhlund', 'Alexander Kronlund')
  and exists (select 1 from public.songs where id = 'ec7ec406-f2cd-4588-a52f-60dec5ab4cd1')
  and not exists (select 1 from public.song_lyricists where song_id = 'ec7ec406-f2cd-4588-a52f-60dec5ab4cd1');

-- "BINGO" (the children's song): its first line came from an unrelated Dutch
-- song and its Genius link was a rap track. No reliable Genius page was found,
-- so the link is cleared.
update public.songs set
  title = 'Bingo',
  first_line = 'There was a farmer had a dog',
  genius_url = null,
  updated_at = now()
where id = '2c8fef42-70a1-4bfc-88b0-42884194ecbc' and title = 'BINGO';

-- "With God On Our Side": Bob Dylan wrote the words. The Clancy brothers were
-- credited as lyricists through "The Patriot Game", whose tune Dylan borrowed;
-- the composer credits (Dylan, Dominic Behan, Traditional) stay.
delete from public.song_lyricists
where song_id = '985f6069-5437-42cd-bac4-af45cf43c2d3'
  and person_id in (
    'e1b80295-c7b0-45e9-833b-33e1cc456204', -- Bobby Clancy
    'f5649e2a-0e98-474b-a4ec-2cdc509a374f', -- Liam Clancy
    '8fe2f080-29af-4cf2-b769-8b8496808253', -- Tom Clancy
    '5682fe4d-15f7-44d8-84a4-a4f388376229'  -- Patrick Clancy
  );

-- "The Boxer" (Carbon Leaf) was "written 2003" but first released on Echo
-- Echo in 2001 (MusicBrainz). The year it was written isn't known.
update public.songs set year_written = null, updated_at = now()
where id = '6f4df8d9-81c0-41c7-929f-5846797747a6' and year_written = 2003;

-- "Twinkle, Twinkle, Little Star": display artist said "Traditional" though
-- the song lists recordings by The Wiggles and Jewel.
update public.songs set display_artist = 'The Wiggles, Jewel', updated_at = now()
where slug = 'twinkle-twinkle-little-star-jane-taylor-traditional-french' and display_artist = 'Traditional';
