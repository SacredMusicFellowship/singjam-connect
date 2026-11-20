-- Migration 182: only a set's owner and co-owners may change or remove its songs.
--
-- Ticket holders are added to an event's set as editors, and the set's QR link
-- hands out the editor role too, so at a public jam the crowd are editors. They
-- were dragging songs out of order by accident. The web API now limits reorder,
-- remove, key, played, notes and leader choice to the owner and co-owners (guests
-- may only put themselves forward to lead); this matches it at the database, so
-- the public anon key can't do directly what the API refuses.
--
-- Both apps write set_songs only through the web API's service-role client, so
-- no app path depends on the editor grant being removed here. Inserts stay open
-- to editors (they can still add songs).

alter policy "set_songs_update" on public.set_songs
  using (
    exists (select 1 from public.sets s where s.id = set_songs.set_id and s.owner_user_id = (select auth.uid()))
    or exists (
      select 1 from public.set_collaborators sc
      where sc.set_id = set_songs.set_id
        and sc.user_id = (select auth.uid())
        and sc.status = 'accepted'
        and sc.role = 'co-owner'
    )
  );

alter policy "set_songs_delete" on public.set_songs
  using (
    exists (select 1 from public.sets s where s.id = set_songs.set_id and s.owner_user_id = (select auth.uid()))
    or exists (
      select 1 from public.set_collaborators sc
      where sc.set_id = set_songs.set_id
        and sc.user_id = (select auth.uid())
        and sc.status = 'accepted'
        and sc.role = 'co-owner'
    )
  );
