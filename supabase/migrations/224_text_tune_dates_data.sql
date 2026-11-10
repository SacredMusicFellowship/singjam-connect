-- Migration 224: dates, sources and cultures for the melody pilot's texts and
-- tunes, so their pages lead with where and when they come from (223).
--
-- Hymn text years are the authors' dates on Hymnary.org; tune dates and first
-- printings are from Hymnary's tune pages. Jewish dates come from the pilot
-- research (Wikipedia, Zemirot Database). Anything not sourced stays empty.
-- Text cultures are the writers' nations, as the songs' lyrics tags already say.

update public.texts t set year = v.year
from (values
  ('Love Divine, All Loves Excelling', 1747),
  ('Come, Thou Long-Expected Jesus', 1744),
  ('O Little Town of Bethlehem', 1868),
  ('It Came Upon the Midnight Clear', 1849),
  ('I Heard the Voice of Jesus Say', 1846),
  ('O God, Our Help in Ages Past', 1719),
  ('Joyful, Joyful, We Adore Thee', 1907),
  ('Eli, Eli', 1942),
  ('Am Yisrael Chai', 1965)
) v(title, year)
where t.title = v.title and t.year is null;

update public.texts t set period = v.period
from (values
  ('Be Thou My Vision', '8th c.'),
  ('Shalom Aleichem', 'c. 1600'),
  ('Lecha Dodi', '16th c.'),
  ('Yedid Nefesh', '16th c.'),
  ('Ma''oz Tzur', '13th c.'),
  ('Tzur Mishelo', '14th c.')
) v(title, period)
where t.title = v.title and t.period is null;

-- Be Thou My Vision: Old Irish, translated by Mary Byrne (1905), versified by Eleanor Hull (1912).
insert into public.people (name) values ('Mary E. Byrne'), ('Eleanor Hull') on conflict (name) do nothing;
insert into public.text_credits (text_id, person_id, role)
select t.id, p.id, v.role
from (values ('Mary E. Byrne', 'translator'), ('Eleanor Hull', 'adapter')) v(name, role)
join public.people p on p.name = v.name
join public.texts t on t.title = 'Be Thou My Vision'
on conflict do nothing;

insert into public.text_tags (text_id, tag_id)
select t.id, g.id
from (values
  ('Love Divine, All Loves Excelling', 'English'),
  ('Come, Thou Long-Expected Jesus', 'English'),
  ('Alleluia! Sing to Jesus', 'English'),
  ('Lord of All Hopefulness', 'English'),
  ('O God, Our Help in Ages Past', 'English'),
  ('Amazing Grace', 'English'),
  ('Come Thou Fount of Every Blessing', 'English'),
  ('I Heard the Voice of Jesus Say', 'Scottish'),
  ('O Little Town of Bethlehem', 'American'),
  ('It Came Upon the Midnight Clear', 'American'),
  ('Away in a Manger', 'American'),
  ('Joyful, Joyful, We Adore Thee', 'American'),
  ('Eli, Eli', 'Israeli')
) v(title, culture)
join public.texts t on t.title = v.title
join public.tags g on g.type = 'culture' and g.name = v.culture
on conflict do nothing;

update public.tunes u set year = v.year, published_in = coalesce(u.published_in, v.published_in)
from (values
  ('St. Anne', 1708, 'A Supplement to the New Version'),
  ('Hymn to Joy', 1824, 'Beethoven''s Ninth Symphony'),
  ('Shalom Aleichem (Goldfarb)', 1918, 'Friday Evening Melodies')
) v(name, year, published_in)
where u.name = v.name;

update public.tunes set year = 1715, published_in = 'Psalmodia Sacra (Gotha)', notes = null
where name = 'Stuttgart' and notes = 'From Psalmodia Sacra (Gotha, 1715), adapted.';

insert into public.tune_tags (tune_id, tag_id)
select u.id, g.id
from (values ('St. Louis', 'American'), ('Carol', 'American'), ('Mueller', 'American'), ('Cradle Song', 'American'),
             ('Beecher', 'American'), ('Vox Dilecti', 'English'), ('New Britain', 'American'), ('Nettleton', 'American')) v(name, culture)
join public.tunes u on u.name = v.name
join public.tags g on g.type = 'culture' and g.name = v.culture
on conflict do nothing;
