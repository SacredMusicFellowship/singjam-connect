-- Migration 192: song editors can fix anything about a song.
-- Songs now fill themselves in when they're added (enrich-song-background), so
-- the role moves from "chord charts and Genius links" to correcting whatever
-- the automatic fill got wrong. Song editors already had UPDATE on songs
-- (migration 102); this adds write access to everything linked to a song, and
-- lets them create (not delete) the people, artists, productions and languages
-- those links point to. Creating and deleting songs, and the genre/theme/culture
-- vocabularies, stay admin-only.

drop policy if exists "song editor write song_composers" on public.song_composers;
create policy "song editor write song_composers" on public.song_composers
  for all using (exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'song_editor'))
  with check (exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'song_editor'));

drop policy if exists "song editor write song_lyricists" on public.song_lyricists;
create policy "song editor write song_lyricists" on public.song_lyricists
  for all using (exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'song_editor'))
  with check (exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'song_editor'));

drop policy if exists "song editor write song_recording_artists" on public.song_recording_artists;
create policy "song editor write song_recording_artists" on public.song_recording_artists
  for all using (exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'song_editor'))
  with check (exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'song_editor'));

drop policy if exists "song editor write song_genres" on public.song_genres;
create policy "song editor write song_genres" on public.song_genres
  for all using (exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'song_editor'))
  with check (exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'song_editor'));

drop policy if exists "song editor write song_themes" on public.song_themes;
create policy "song editor write song_themes" on public.song_themes
  for all using (exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'song_editor'))
  with check (exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'song_editor'));

drop policy if exists "song editor write song_cultures" on public.song_cultures;
create policy "song editor write song_cultures" on public.song_cultures
  for all using (exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'song_editor'))
  with check (exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'song_editor'));

drop policy if exists "song editor write song_languages" on public.song_languages;
create policy "song editor write song_languages" on public.song_languages
  for all using (exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'song_editor'))
  with check (exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'song_editor'));

drop policy if exists "song editor write song_productions" on public.song_productions;
create policy "song editor write song_productions" on public.song_productions
  for all using (exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'song_editor'))
  with check (exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'song_editor'));

drop policy if exists "song editor write song_alternate_titles" on public.song_alternate_titles;
create policy "song editor write song_alternate_titles" on public.song_alternate_titles
  for all using (exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'song_editor'))
  with check (exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'song_editor'));

drop policy if exists "song editor insert people" on public.people;
create policy "song editor insert people" on public.people
  for insert with check (exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'song_editor'));
drop policy if exists "song editor update people" on public.people;
create policy "song editor update people" on public.people
  for update using (exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'song_editor')) with check (exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'song_editor'));

drop policy if exists "song editor insert artists" on public.artists;
create policy "song editor insert artists" on public.artists
  for insert with check (exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'song_editor'));
drop policy if exists "song editor update artists" on public.artists;
create policy "song editor update artists" on public.artists
  for update using (exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'song_editor')) with check (exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'song_editor'));

drop policy if exists "song editor insert productions" on public.productions;
create policy "song editor insert productions" on public.productions
  for insert with check (exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'song_editor'));
drop policy if exists "song editor update productions" on public.productions;
create policy "song editor update productions" on public.productions
  for update using (exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'song_editor')) with check (exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'song_editor'));

drop policy if exists "song editor insert languages" on public.languages;
create policy "song editor insert languages" on public.languages
  for insert with check (exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'song_editor'));
drop policy if exists "song editor update languages" on public.languages;
create policy "song editor update languages" on public.languages
  for update using (exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'song_editor')) with check (exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'song_editor'));
