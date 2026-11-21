-- Migration 226: the years still missing from the melody pilot's tunes and texts.
--
-- A year is when the tune or words were written where a source says so,
-- otherwise when first printed; `published_in` names the first printing.
-- Sources: Wikipedia, the Canterbury Dictionary of Hymnology, Hymnology Archive,
-- AllMusic and the FAU Recorded Sound Archives. Left empty because sources are
-- missing or disagree: Adon Olam's text (12th–14th c. by different scholars)
-- and the Shmuel Brazil, Debbie Friedman, Moshe Jacobson and Los Bilbilicos
-- melodies.

update public.tunes u set
  year = v.year,
  year_precision = v.precision,
  published_in = coalesce(u.published_in, v.published_in)
from (values
  ('Beecher', 1870, 'exact', 'Christian Heart Songs'),
  ('Hyfrydol', 1844, 'exact', 'Cyfaill y Cantorion'),
  ('Blaenwern', 1905, 'circa', 'Cân a Moliant (1915)'),
  ('St. Louis', 1868, 'exact', null),
  ('Forest Green', 1906, 'exact', 'The English Hymnal'),
  ('Kingsfold', 1906, 'exact', 'The English Hymnal'),
  ('Carol', 1850, 'exact', null),
  ('Noel', 1874, 'exact', 'Church Hymns with Tunes'),
  ('Mueller', 1887, 'exact', 'Dainty Songs for Little Lads and Lasses'),
  ('Cradle Song', 1895, 'exact', 'Around the World with Christmas'),
  ('Vox Dilecti', 1868, 'exact', 'Hymns Ancient & Modern'),
  ('Slane', 1909, 'exact', 'Old Irish Folk Music and Songs'),
  ('New Britain', 1829, 'exact', 'Columbian Harmony'),
  ('Nettleton', 1813, 'exact', 'Wyeth''s Repository of Sacred Music, Part Second'),
  ('Lecha Dodi (Taubman)', 1999, 'exact', 'Friday Night Live (album)'),
  ('Esa Einai (Carlebach)', 1959, 'exact', 'Haneshama Lach (album)'),
  ('Kuando el Rey Nimrod', 1890, 'circa', null),
  ('Ma''oz Tzur (Ashkenazi)', 1450, 'century', null)
) v(name, year, precision, published_in)
where u.name = v.name and u.year is null;

update public.tunes set notes = null
where name = 'Nettleton' and notes = 'American melody, first printed in Wyeth''s Repository of Sacred Music, Part Second (1813).';

update public.texts x set year = v.year, year_precision = 'exact'
from (values
  ('Alleluia! Sing to Jesus', 1866),
  ('Lord of All Hopefulness', 1931),
  ('Away in a Manger', 1882),
  ('Amazing Grace', 1772),
  ('Come Thou Fount of Every Blessing', 1759)
) v(title, year)
where x.title = v.title and x.year is null;
