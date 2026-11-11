-- Migration 222: credit fixes for the melody pilot (221).
--
-- 1. "Shabbat table (zemirot)" is when Shalom Aleichem and Tzur Mishelo are
--    sung, not where their words come from, so it isn't a text source (the
--    song page shows a text's source on its Words line).
-- 2. Anonymous Jewish texts credit their words to Traditional, as Be Thou My
--    Vision does, so the Words line names who wrote them.
-- 3. Rowland Hugh Prichard is printed "Rowland H. Prichard" in hymnals; the
--    short form read "R. Hugh Prichard".

delete from public.text_sources ts
using public.texts t
where ts.text_id = t.id and t.title in ('Shalom Aleichem', 'Tzur Mishelo') and ts.citation = 'Shabbat table (zemirot)';

insert into public.song_lyricists (song_id, person_id)
select s.id, p.id
from public.songs s
join public.texts t on t.id = s.text_id
join public.people p on p.name = 'Traditional'
where t.title in ('Shalom Aleichem', 'Adon Olam', 'Ma''oz Tzur', 'Tzur Mishelo')
  and not exists (select 1 from public.song_lyricists l where l.song_id = s.id)
on conflict do nothing;

update public.people set name = 'Rowland H. Prichard'
where name = 'Rowland Hugh Prichard' and not exists (select 1 from public.people where name = 'Rowland H. Prichard');
