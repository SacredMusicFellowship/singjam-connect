-- Migration 221: the melody pilot (PR 6 of the song catalogue plan).
--
-- One song per melody: a text sung to several tunes becomes several songs
-- that share the text and each name their tune (Love Divine to Beecher,
-- Hyfrydol and Blaenwern). 18 hymn settings checked against Hymnary.org,
-- 16 Jewish settings and 4 Chabad nigunim, each reviewed by Ben with a
-- reference recording. Tunes shared across texts (Hyfrydol, Kingsfold, Slane)
-- are one row, so "same tune" and "you know the tune" work across hymns.
--
-- songs_title_artist_unique also keys on the tune now: several songs share a
-- title and have no recording artist, told apart by their tune. Songs with no
-- tune keep the old rule.

drop index if exists public.songs_title_artist_unique;
create unique index songs_title_artist_unique
  on public.songs (lower(trim(title)), lower(trim(coalesce(display_artist, ''))), coalesce(tune_id, '00000000-0000-0000-0000-000000000000'::uuid));

insert into public.people (name) values
  ('Arthur Sullivan'),
  ('Charles Wesley'),
  ('Craig Taubman'),
  ('David Zehavi'),
  ('Debbie Friedman'),
  ('Edmund H. Sears'),
  ('Edward Hodges'),
  ('Ehud Zweig'),
  ('Elazar Azikri'),
  ('Eliezer Mordecai Gerovitsch'),
  ('Hannah Szenes'),
  ('Henry van Dyke'),
  ('Horatius Bonar'),
  ('Isaac Watts'),
  ('Israel Goldfarb'),
  ('James R. Murray'),
  ('Jan Struther'),
  ('John B. Dykes'),
  ('John T. McFarland'),
  ('John Zundel'),
  ('Lewis H. Redner'),
  ('Ludwig van Beethoven'),
  ('Moshe Jacobson'),
  ('Nurit Hirsh'),
  ('Phillips Brooks'),
  ('Ralph Vaughan Williams'),
  ('Richard Storrs Willis'),
  ('Rowland Hugh Prichard'),
  ('Samuel E. Goldfarb'),
  ('Sara Zweig'),
  ('Shlomo Carlebach'),
  ('Shlomo Halevi Alkabetz'),
  ('Shmuel Brazil'),
  ('Shneur Zalman of Liadi'),
  ('Tanchum Portnoy'),
  ('Uzi Hitman'),
  ('William Chatterton Dix'),
  ('William Croft'),
  ('William J. Kirkpatrick'),
  ('William Rowlands')
on conflict (name) do nothing;

do $$
declare
  tid uuid;
  uid uuid;
  sid uuid;
begin
  -- Love Divine, All Loves Excelling
  insert into public.texts (title, kind, first_line, notes) values ('Love Divine, All Loves Excelling', 'hymn', 'Love divine, all loves excelling, joy of heaven, to earth come down', null) returning id into tid;
  insert into public.text_credits (text_id, person_id, role) values (tid, (select id from public.people where name = 'Charles Wesley'), 'author') on conflict do nothing;
  insert into public.text_tags (text_id, tag_id) select tid, id from public.tags where type = 'community' and name = 'Christian' on conflict do nothing;
  insert into public.text_tags (text_id, tag_id) select tid, id from public.tags where type = 'language' and name = 'English' on conflict do nothing;
  -- Come, Thou Long-Expected Jesus
  insert into public.texts (title, kind, first_line, notes) values ('Come, Thou Long-Expected Jesus', 'hymn', 'Come, thou long-expected Jesus, born to set thy people free', null) returning id into tid;
  insert into public.text_credits (text_id, person_id, role) values (tid, (select id from public.people where name = 'Charles Wesley'), 'author') on conflict do nothing;
  insert into public.text_tags (text_id, tag_id) select tid, id from public.tags where type = 'community' and name = 'Christian' on conflict do nothing;
  insert into public.text_tags (text_id, tag_id) select tid, id from public.tags where type = 'language' and name = 'English' on conflict do nothing;
  -- Alleluia! Sing to Jesus
  insert into public.texts (title, kind, first_line, notes) values ('Alleluia! Sing to Jesus', 'hymn', 'Alleluia! Sing to Jesus! His the scepter, his the throne', null) returning id into tid;
  insert into public.text_credits (text_id, person_id, role) values (tid, (select id from public.people where name = 'William Chatterton Dix'), 'author') on conflict do nothing;
  insert into public.text_tags (text_id, tag_id) select tid, id from public.tags where type = 'community' and name = 'Christian' on conflict do nothing;
  insert into public.text_tags (text_id, tag_id) select tid, id from public.tags where type = 'language' and name = 'English' on conflict do nothing;
  -- O Little Town of Bethlehem
  insert into public.texts (title, kind, first_line, notes) values ('O Little Town of Bethlehem', 'hymn', 'O little town of Bethlehem, how still we see thee lie', null) returning id into tid;
  insert into public.text_credits (text_id, person_id, role) values (tid, (select id from public.people where name = 'Phillips Brooks'), 'author') on conflict do nothing;
  insert into public.text_tags (text_id, tag_id) select tid, id from public.tags where type = 'community' and name = 'Christian' on conflict do nothing;
  insert into public.text_tags (text_id, tag_id) select tid, id from public.tags where type = 'language' and name = 'English' on conflict do nothing;
  -- It Came Upon the Midnight Clear
  insert into public.texts (title, kind, first_line, notes) values ('It Came Upon the Midnight Clear', 'hymn', 'It came upon the midnight clear, that glorious song of old', null) returning id into tid;
  insert into public.text_credits (text_id, person_id, role) values (tid, (select id from public.people where name = 'Edmund H. Sears'), 'author') on conflict do nothing;
  insert into public.text_tags (text_id, tag_id) select tid, id from public.tags where type = 'community' and name = 'Christian' on conflict do nothing;
  insert into public.text_tags (text_id, tag_id) select tid, id from public.tags where type = 'language' and name = 'English' on conflict do nothing;
  -- Away in a Manger
  insert into public.texts (title, kind, first_line, notes) values ('Away in a Manger', 'hymn', 'Away in a manger, no crib for a bed', 'The first two stanzas are anonymous (American, 1880s); the third is credited to John T. McFarland. The old attribution to Martin Luther is a legend.') returning id into tid;
  insert into public.text_credits (text_id, person_id, role) values (tid, (select id from public.people where name = 'John T. McFarland'), 'author') on conflict do nothing;
  insert into public.text_tags (text_id, tag_id) select tid, id from public.tags where type = 'community' and name = 'Christian' on conflict do nothing;
  insert into public.text_tags (text_id, tag_id) select tid, id from public.tags where type = 'language' and name = 'English' on conflict do nothing;
  -- I Heard the Voice of Jesus Say
  insert into public.texts (title, kind, first_line, notes) values ('I Heard the Voice of Jesus Say', 'hymn', 'I heard the voice of Jesus say, "Come unto me and rest"', null) returning id into tid;
  insert into public.text_credits (text_id, person_id, role) values (tid, (select id from public.people where name = 'Horatius Bonar'), 'author') on conflict do nothing;
  insert into public.text_tags (text_id, tag_id) select tid, id from public.tags where type = 'community' and name = 'Christian' on conflict do nothing;
  insert into public.text_tags (text_id, tag_id) select tid, id from public.tags where type = 'language' and name = 'English' on conflict do nothing;
  -- Lord of All Hopefulness
  insert into public.texts (title, kind, first_line, notes) values ('Lord of All Hopefulness', 'hymn', 'Lord of all hopefulness, Lord of all joy', null) returning id into tid;
  insert into public.text_credits (text_id, person_id, role) values (tid, (select id from public.people where name = 'Jan Struther'), 'author') on conflict do nothing;
  insert into public.text_tags (text_id, tag_id) select tid, id from public.tags where type = 'community' and name = 'Christian' on conflict do nothing;
  insert into public.text_tags (text_id, tag_id) select tid, id from public.tags where type = 'language' and name = 'English' on conflict do nothing;
  -- O God, Our Help in Ages Past
  insert into public.texts (title, kind, first_line, notes) values ('O God, Our Help in Ages Past', 'hymn', 'O God, our help in ages past, our hope for years to come', null) returning id into tid;
  insert into public.text_credits (text_id, person_id, role) values (tid, (select id from public.people where name = 'Isaac Watts'), 'author') on conflict do nothing;
  insert into public.text_sources (text_id, corpus, book, chapter_start, verse_start, chapter_end, verse_end, citation, relation) values (tid, 'tanakh', 'Psalms', '90', null, null, null, null, 'metrical');
  insert into public.text_tags (text_id, tag_id) select tid, id from public.tags where type = 'community' and name = 'Christian' on conflict do nothing;
  insert into public.text_tags (text_id, tag_id) select tid, id from public.tags where type = 'language' and name = 'English' on conflict do nothing;
  -- Joyful, Joyful, We Adore Thee
  insert into public.texts (title, kind, first_line, notes) values ('Joyful, Joyful, We Adore Thee', 'hymn', 'Joyful, joyful, we adore thee, God of glory, Lord of love', null) returning id into tid;
  insert into public.text_credits (text_id, person_id, role) values (tid, (select id from public.people where name = 'Henry van Dyke'), 'author') on conflict do nothing;
  insert into public.text_tags (text_id, tag_id) select tid, id from public.tags where type = 'community' and name = 'Christian' on conflict do nothing;
  insert into public.text_tags (text_id, tag_id) select tid, id from public.tags where type = 'language' and name = 'English' on conflict do nothing;
  -- Shalom Aleichem
  insert into public.texts (title, kind, first_line, notes) values ('Shalom Aleichem', 'poem', 'Shalom aleichem, malachei hashareit, malachei elyon', 'Friday-night Shabbat table song welcoming the angels, from the Safed kabbalists of the late 16th or early 17th century.') returning id into tid;
  insert into public.text_titles (text_id, title, kind) values (tid, 'Shalom Aleikhem', 'transliteration') on conflict do nothing;
  insert into public.text_titles (text_id, title, kind) values (tid, 'Sholom Aleichem', 'transliteration') on conflict do nothing;
  insert into public.text_titles (text_id, title, kind) values (tid, 'Peace Be Upon You', 'translation') on conflict do nothing;
  insert into public.text_sources (text_id, corpus, book, chapter_start, verse_start, chapter_end, verse_end, citation, relation) values (tid, 'liturgy', null, null, null, null, null, 'Shabbat table (zemirot)', 'quoted');
  insert into public.text_tags (text_id, tag_id) select tid, id from public.tags where type = 'community' and name = 'Jewish' on conflict do nothing;
  insert into public.text_tags (text_id, tag_id) select tid, id from public.tags where type = 'language' and name = 'Hebrew' on conflict do nothing;
  -- Lecha Dodi
  select id into tid from public.texts where title = 'Lecha Dodi';
  update public.texts set kind = coalesce(kind, 'poem'), first_line = coalesce(first_line, 'L''cha dodi likrat kala, p''nei Shabbat n''kab''lah'), notes = coalesce(notes, 'Sung at Kabbalat Shabbat to welcome the Sabbath; 16th century.') where id = tid;
  insert into public.text_titles (text_id, title, kind) values (tid, 'Lekhah Dodi', 'transliteration') on conflict do nothing;
  insert into public.text_titles (text_id, title, kind) values (tid, 'L''cha Dodi', 'transliteration') on conflict do nothing;
  insert into public.text_titles (text_id, title, kind) values (tid, 'Come, My Beloved', 'translation') on conflict do nothing;
  insert into public.text_credits (text_id, person_id, role) values (tid, (select id from public.people where name = 'Shlomo Halevi Alkabetz'), 'author') on conflict do nothing;
  insert into public.text_sources (text_id, corpus, book, chapter_start, verse_start, chapter_end, verse_end, citation, relation) values (tid, 'liturgy', null, null, null, null, null, 'Kabbalat Shabbat', 'quoted');
  insert into public.text_tags (text_id, tag_id) select tid, id from public.tags where type = 'community' and name = 'Jewish' on conflict do nothing;
  insert into public.text_tags (text_id, tag_id) select tid, id from public.tags where type = 'language' and name = 'Hebrew' on conflict do nothing;
  -- Adon Olam
  insert into public.texts (title, kind, first_line, notes) values ('Adon Olam', 'liturgy', 'Adon olam asher malach', 'Metrical hymn closing Shabbat and festival services. Its author is uncertain; the attribution to Solomon ibn Gabirol has no solid evidence.') returning id into tid;
  insert into public.text_titles (text_id, title, kind) values (tid, 'Adon ''Olam', 'transliteration') on conflict do nothing;
  insert into public.text_titles (text_id, title, kind) values (tid, 'Master of the World', 'translation') on conflict do nothing;
  insert into public.text_sources (text_id, corpus, book, chapter_start, verse_start, chapter_end, verse_end, citation, relation) values (tid, 'liturgy', null, null, null, null, null, 'Shabbat and festival services', 'quoted');
  insert into public.text_tags (text_id, tag_id) select tid, id from public.tags where type = 'community' and name = 'Jewish' on conflict do nothing;
  insert into public.text_tags (text_id, tag_id) select tid, id from public.tags where type = 'language' and name = 'Hebrew' on conflict do nothing;
  -- Oseh Shalom
  insert into public.texts (title, kind, first_line, notes) values ('Oseh Shalom', 'liturgy', 'Oseh shalom bimromav', 'The closing line of the Amidah and of the Kaddish.') returning id into tid;
  insert into public.text_titles (text_id, title, kind) values (tid, 'Ose Shalom', 'transliteration') on conflict do nothing;
  insert into public.text_titles (text_id, title, kind) values (tid, 'Oseh Shalom Bimromav', 'alternate') on conflict do nothing;
  insert into public.text_titles (text_id, title, kind) values (tid, 'Maker of Peace', 'translation') on conflict do nothing;
  insert into public.text_sources (text_id, corpus, book, chapter_start, verse_start, chapter_end, verse_end, citation, relation) values (tid, 'liturgy', null, null, null, null, null, 'Amidah; Kaddish', 'quoted');
  insert into public.text_tags (text_id, tag_id) select tid, id from public.tags where type = 'community' and name = 'Jewish' on conflict do nothing;
  insert into public.text_tags (text_id, tag_id) select tid, id from public.tags where type = 'language' and name = 'Hebrew' on conflict do nothing;
  -- Ma'oz Tzur
  insert into public.texts (title, kind, first_line, notes) values ('Ma''oz Tzur', 'poem', 'Ma''oz tzur yeshu''ati, lecha na''eh leshabei''ach', 'Hanukkah hymn sung after lighting the candles; 13th century (possibly 12th), with an acrostic signed Mordechai.') returning id into tid;
  insert into public.text_titles (text_id, title, kind) values (tid, 'Maoz Tzur', 'transliteration') on conflict do nothing;
  insert into public.text_titles (text_id, title, kind) values (tid, 'Maoz Tsur', 'transliteration') on conflict do nothing;
  insert into public.text_titles (text_id, title, kind) values (tid, 'Rock of Ages', 'translation') on conflict do nothing;
  insert into public.text_tags (text_id, tag_id) select tid, id from public.tags where type = 'community' and name = 'Jewish' on conflict do nothing;
  insert into public.text_tags (text_id, tag_id) select tid, id from public.tags where type = 'language' and name = 'Hebrew' on conflict do nothing;
  -- Yedid Nefesh
  insert into public.texts (title, kind, first_line, notes) values ('Yedid Nefesh', 'poem', 'Yedid nefesh, Av harachaman', 'Sung before Kabbalat Shabbat and at the third Shabbat meal. First printed in Sefer Charedim (Venice, 1601).') returning id into tid;
  insert into public.text_titles (text_id, title, kind) values (tid, 'Y''did Nefesh', 'transliteration') on conflict do nothing;
  insert into public.text_titles (text_id, title, kind) values (tid, 'Beloved of the Soul', 'translation') on conflict do nothing;
  insert into public.text_credits (text_id, person_id, role) values (tid, (select id from public.people where name = 'Elazar Azikri'), 'author') on conflict do nothing;
  insert into public.text_sources (text_id, corpus, book, chapter_start, verse_start, chapter_end, verse_end, citation, relation) values (tid, 'other', null, null, null, null, null, 'Sefer Charedim (Venice, 1601)', 'quoted');
  insert into public.text_tags (text_id, tag_id) select tid, id from public.tags where type = 'community' and name = 'Jewish' on conflict do nothing;
  insert into public.text_tags (text_id, tag_id) select tid, id from public.tags where type = 'language' and name = 'Hebrew' on conflict do nothing;
  -- Tzur Mishelo
  insert into public.texts (title, kind, first_line, notes) values ('Tzur Mishelo', 'poem', 'Tzur mishelo achalnu, bar''chu emunai', 'Shabbat table song that leads into the grace after meals; anonymous, probably from northern France, by the late 14th century.') returning id into tid;
  insert into public.text_titles (text_id, title, kind) values (tid, 'Tzur Mishelo Achalnu', 'alternate') on conflict do nothing;
  insert into public.text_titles (text_id, title, kind) values (tid, 'Tsur Mishelo', 'transliteration') on conflict do nothing;
  insert into public.text_titles (text_id, title, kind) values (tid, 'Rock from Whose Store We Have Eaten', 'translation') on conflict do nothing;
  insert into public.text_sources (text_id, corpus, book, chapter_start, verse_start, chapter_end, verse_end, citation, relation) values (tid, 'liturgy', null, null, null, null, null, 'Shabbat table (zemirot)', 'quoted');
  insert into public.text_tags (text_id, tag_id) select tid, id from public.tags where type = 'community' and name = 'Jewish' on conflict do nothing;
  insert into public.text_tags (text_id, tag_id) select tid, id from public.tags where type = 'language' and name = 'Hebrew' on conflict do nothing;
  -- Esa Einai
  insert into public.texts (title, kind, first_line, notes) values ('Esa Einai', 'scripture', 'Esa einai el heharim, me''ayin yavo ezri', null) returning id into tid;
  insert into public.text_titles (text_id, title, kind) values (tid, 'Esah Einai', 'transliteration') on conflict do nothing;
  insert into public.text_titles (text_id, title, kind) values (tid, 'I Lift My Eyes', 'translation') on conflict do nothing;
  insert into public.text_sources (text_id, corpus, book, chapter_start, verse_start, chapter_end, verse_end, citation, relation) values (tid, 'tanakh', 'Psalms', '121', '1', null, '2', null, 'quoted');
  insert into public.text_tags (text_id, tag_id) select tid, id from public.tags where type = 'community' and name = 'Jewish' on conflict do nothing;
  insert into public.text_tags (text_id, tag_id) select tid, id from public.tags where type = 'language' and name = 'Hebrew' on conflict do nothing;
  -- Eli, Eli
  insert into public.texts (title, kind, first_line, notes) values ('Eli, Eli', 'poem', 'Eli, Eli, shelo yigamer l''olam', 'Written by Hannah Szenes in 1942 at kibbutz Sdot Yam.') returning id into tid;
  insert into public.text_titles (text_id, title, kind) values (tid, 'Halikha LeKesariya', 'alternate') on conflict do nothing;
  insert into public.text_titles (text_id, title, kind) values (tid, 'A Walk to Caesarea', 'translation') on conflict do nothing;
  insert into public.text_titles (text_id, title, kind) values (tid, 'My God, My God', 'translation') on conflict do nothing;
  insert into public.text_credits (text_id, person_id, role) values (tid, (select id from public.people where name = 'Hannah Szenes'), 'author') on conflict do nothing;
  insert into public.text_tags (text_id, tag_id) select tid, id from public.tags where type = 'community' and name = 'Jewish' on conflict do nothing;
  insert into public.text_tags (text_id, tag_id) select tid, id from public.tags where type = 'language' and name = 'Hebrew' on conflict do nothing;
  -- Am Yisrael Chai
  insert into public.texts (title, kind, first_line, notes) values ('Am Yisrael Chai', 'lyric', 'Am Yisrael chai, od avinu chai', null) returning id into tid;
  insert into public.text_titles (text_id, title, kind) values (tid, 'Am Yisroel Chai', 'transliteration') on conflict do nothing;
  insert into public.text_titles (text_id, title, kind) values (tid, 'The People of Israel Live', 'translation') on conflict do nothing;
  insert into public.text_credits (text_id, person_id, role) values (tid, (select id from public.people where name = 'Shlomo Carlebach'), 'adapter') on conflict do nothing;
  insert into public.text_sources (text_id, corpus, book, chapter_start, verse_start, chapter_end, verse_end, citation, relation) values (tid, 'tanakh', 'Genesis', '45', '3', null, null, null, 'inspired');
  insert into public.text_tags (text_id, tag_id) select tid, id from public.tags where type = 'community' and name = 'Jewish' on conflict do nothing;
  insert into public.text_tags (text_id, tag_id) select tid, id from public.tags where type = 'language' and name = 'Hebrew' on conflict do nothing;
  -- Etz Chayim Hi
  insert into public.texts (title, kind, first_line, notes) values ('Etz Chayim Hi', 'liturgy', 'Etz chayim hi lamachazikim bah', 'Sung when the Torah is returned to the ark.') returning id into tid;
  insert into public.text_titles (text_id, title, kind) values (tid, 'Eitz Chayim Hi', 'transliteration') on conflict do nothing;
  insert into public.text_titles (text_id, title, kind) values (tid, 'Etz Chaim Hi', 'transliteration') on conflict do nothing;
  insert into public.text_titles (text_id, title, kind) values (tid, 'It Is a Tree of Life', 'translation') on conflict do nothing;
  insert into public.text_sources (text_id, corpus, book, chapter_start, verse_start, chapter_end, verse_end, citation, relation) values (tid, 'tanakh', 'Proverbs', '3', '18', null, null, null, 'quoted');
  insert into public.text_sources (text_id, corpus, book, chapter_start, verse_start, chapter_end, verse_end, citation, relation) values (tid, 'tanakh', 'Proverbs', '3', '17', null, null, null, 'quoted');
  insert into public.text_sources (text_id, corpus, book, chapter_start, verse_start, chapter_end, verse_end, citation, relation) values (tid, 'tanakh', 'Lamentations', '5', '21', null, null, null, 'quoted');
  insert into public.text_tags (text_id, tag_id) select tid, id from public.tags where type = 'community' and name = 'Jewish' on conflict do nothing;
  insert into public.text_tags (text_id, tag_id) select tid, id from public.tags where type = 'language' and name = 'Hebrew' on conflict do nothing;
  -- tune Beecher
  insert into public.tunes (name, meter, year, notes, recording_url) values ('Beecher', '8.7.8.7 D', null, null, 'https://www.youtube.com/watch?v=AjInv0aBREk') returning id into uid;
  insert into public.tune_credits (tune_id, person_id, role) values (uid, (select id from public.people where name = 'John Zundel'), 'composer') on conflict do nothing;
  -- tune Hyfrydol
  insert into public.tunes (name, meter, year, notes, recording_url) values ('Hyfrydol', '8.7.8.7 D', null, null, 'https://www.youtube.com/watch?v=jPdVaL6wh-U') returning id into uid;
  insert into public.tune_credits (tune_id, person_id, role) values (uid, (select id from public.people where name = 'Rowland Hugh Prichard'), 'composer') on conflict do nothing;
  insert into public.tune_tags (tune_id, tag_id) select uid, id from public.tags where type = 'culture' and name = 'Welsh' on conflict do nothing;
  -- tune Blaenwern
  insert into public.tunes (name, meter, year, notes, recording_url) values ('Blaenwern', '8.7.8.7 D', null, null, 'https://www.youtube.com/watch?v=0gvCODgV1fc') returning id into uid;
  insert into public.tune_credits (tune_id, person_id, role) values (uid, (select id from public.people where name = 'William Rowlands'), 'composer') on conflict do nothing;
  insert into public.tune_tags (tune_id, tag_id) select uid, id from public.tags where type = 'culture' and name = 'Welsh' on conflict do nothing;
  -- tune Stuttgart
  insert into public.tunes (name, meter, year, notes, recording_url) values ('Stuttgart', '8.7.8.7', null, 'From Psalmodia Sacra (Gotha, 1715), adapted.', 'https://www.youtube.com/watch?v=z_YA9GZB76I') returning id into uid;
  insert into public.tune_tags (tune_id, tag_id) select uid, id from public.tags where type = 'culture' and name = 'German' on conflict do nothing;
  -- tune St. Louis
  insert into public.tunes (name, meter, year, notes, recording_url) values ('St. Louis', '8.6.8.6.7.6.8.6', null, null, 'https://www.youtube.com/watch?v=OPNDuSFrOZ4') returning id into uid;
  insert into public.tune_credits (tune_id, person_id, role) values (uid, (select id from public.people where name = 'Lewis H. Redner'), 'composer') on conflict do nothing;
  -- tune Forest Green
  insert into public.tunes (name, meter, year, notes, recording_url) values ('Forest Green', 'CMD (8.6.8.6 D)', null, 'English folk melody, arranged by Ralph Vaughan Williams.', 'https://www.youtube.com/watch?v=H_q430z13oc') returning id into uid;
  insert into public.tune_credits (tune_id, person_id, role) values (uid, (select id from public.people where name = 'Traditional'), 'composer') on conflict do nothing;
  insert into public.tune_credits (tune_id, person_id, role) values (uid, (select id from public.people where name = 'Ralph Vaughan Williams'), 'arranger') on conflict do nothing;
  insert into public.tune_tags (tune_id, tag_id) select uid, id from public.tags where type = 'culture' and name = 'English' on conflict do nothing;
  -- tune Kingsfold
  insert into public.tunes (name, meter, year, notes, recording_url) values ('Kingsfold', 'CMD (8.6.8.6 D)', null, 'English folk melody, arranged by Ralph Vaughan Williams.', 'https://www.youtube.com/watch?v=TrTZklB-JVk') returning id into uid;
  insert into public.tune_credits (tune_id, person_id, role) values (uid, (select id from public.people where name = 'Traditional'), 'composer') on conflict do nothing;
  insert into public.tune_credits (tune_id, person_id, role) values (uid, (select id from public.people where name = 'Ralph Vaughan Williams'), 'arranger') on conflict do nothing;
  insert into public.tune_tags (tune_id, tag_id) select uid, id from public.tags where type = 'culture' and name = 'English' on conflict do nothing;
  -- tune Carol
  insert into public.tunes (name, meter, year, notes, recording_url) values ('Carol', 'CMD (8.6.8.6 D)', null, null, 'https://www.youtube.com/watch?v=Ljrf6G1kmto') returning id into uid;
  insert into public.tune_credits (tune_id, person_id, role) values (uid, (select id from public.people where name = 'Richard Storrs Willis'), 'composer') on conflict do nothing;
  -- tune Noel
  insert into public.tunes (name, meter, year, notes, recording_url) values ('Noel', 'CMD (8.6.8.6 D)', null, 'Adapted by Arthur Sullivan from an English melody.', 'https://www.youtube.com/watch?v=cX4LUpOMUBs') returning id into uid;
  insert into public.tune_credits (tune_id, person_id, role) values (uid, (select id from public.people where name = 'Arthur Sullivan'), 'adapter') on conflict do nothing;
  insert into public.tune_tags (tune_id, tag_id) select uid, id from public.tags where type = 'culture' and name = 'English' on conflict do nothing;
  -- tune Mueller
  insert into public.tunes (name, meter, year, notes, recording_url) values ('Mueller', '11.11.11.11', null, 'Also called AWAY IN A MANGER.', 'https://www.youtube.com/watch?v=dB9zvdegifU') returning id into uid;
  insert into public.tune_credits (tune_id, person_id, role) values (uid, (select id from public.people where name = 'James R. Murray'), 'composer') on conflict do nothing;
  -- tune Cradle Song
  insert into public.tunes (name, meter, year, notes, recording_url) values ('Cradle Song', '11.11.11.11', null, null, 'https://www.youtube.com/watch?v=iI8-tExjktI') returning id into uid;
  insert into public.tune_credits (tune_id, person_id, role) values (uid, (select id from public.people where name = 'William J. Kirkpatrick'), 'composer') on conflict do nothing;
  -- tune Vox Dilecti
  insert into public.tunes (name, meter, year, notes, recording_url) values ('Vox Dilecti', 'CMD (8.6.8.6 D)', null, null, 'https://www.youtube.com/watch?v=GHylH7m8TeE') returning id into uid;
  insert into public.tune_credits (tune_id, person_id, role) values (uid, (select id from public.people where name = 'John B. Dykes'), 'composer') on conflict do nothing;
  -- tune St. Anne
  insert into public.tunes (name, meter, year, notes, recording_url) values ('St. Anne', 'CM (8.6.8.6)', null, null, 'https://www.youtube.com/watch?v=fyXM83T9u54') returning id into uid;
  insert into public.tune_credits (tune_id, person_id, role) values (uid, (select id from public.people where name = 'William Croft'), 'composer') on conflict do nothing;
  insert into public.tune_tags (tune_id, tag_id) select uid, id from public.tags where type = 'culture' and name = 'English' on conflict do nothing;
  -- tune Hymn to Joy
  insert into public.tunes (name, meter, year, notes, recording_url) values ('Hymn to Joy', '8.7.8.7 D', null, 'From the finale of Beethoven''s Ninth Symphony, arranged as a hymn tune by Edward Hodges.', 'https://www.youtube.com/watch?v=0lPpMyooeY0') returning id into uid;
  insert into public.tune_credits (tune_id, person_id, role) values (uid, (select id from public.people where name = 'Ludwig van Beethoven'), 'composer') on conflict do nothing;
  insert into public.tune_credits (tune_id, person_id, role) values (uid, (select id from public.people where name = 'Edward Hodges'), 'arranger') on conflict do nothing;
  insert into public.tune_tags (tune_id, tag_id) select uid, id from public.tags where type = 'culture' and name = 'German' on conflict do nothing;
  -- tune Shalom Aleichem (Goldfarb)
  insert into public.tunes (name, meter, year, notes, recording_url) values ('Shalom Aleichem (Goldfarb)', null, 1918, 'The standard slow Ashkenazi melody, published by the Goldfarb brothers in Friday Evening Melodies (1918).', 'https://www.youtube.com/watch?v=qmDYpf46Kyw') returning id into uid;
  insert into public.tune_credits (tune_id, person_id, role) values (uid, (select id from public.people where name = 'Israel Goldfarb'), 'composer') on conflict do nothing;
  insert into public.tune_credits (tune_id, person_id, role) values (uid, (select id from public.people where name = 'Samuel E. Goldfarb'), 'composer') on conflict do nothing;
  insert into public.tune_tags (tune_id, tag_id) select uid, id from public.tags where type = 'community' and name = 'Ashkenazi' on conflict do nothing;
  -- tune Shalom Aleichem (Shmuel Brazil)
  insert into public.tunes (name, meter, year, notes, recording_url) values ('Shalom Aleichem (Shmuel Brazil)', null, null, 'A faster, upbeat melody.', 'https://www.youtube.com/watch?v=akcC2GlBmNk') returning id into uid;
  insert into public.tune_credits (tune_id, person_id, role) values (uid, (select id from public.people where name = 'Shmuel Brazil'), 'composer') on conflict do nothing;
  -- tune Kuando el Rey Nimrod
  insert into public.tunes (name, meter, year, notes, recording_url) values ('Kuando el Rey Nimrod', null, null, 'Ladino song melody; Moroccan communities sing Shalom Aleichem to it.', 'https://www.youtube.com/watch?v=woUbBu_Q1sg') returning id into uid;
  insert into public.tune_credits (tune_id, person_id, role) values (uid, (select id from public.people where name = 'Traditional'), 'composer') on conflict do nothing;
  insert into public.tune_tags (tune_id, tag_id) select uid, id from public.tags where type = 'community' and name = 'Moroccan' on conflict do nothing;
  insert into public.tune_tags (tune_id, tag_id) select uid, id from public.tags where type = 'community' and name = 'Sephardi' on conflict do nothing;
  -- tune Lecha Dodi (Taubman)
  insert into public.tunes (name, meter, year, notes, recording_url) values ('Lecha Dodi (Taubman)', null, null, null, 'https://www.youtube.com/watch?v=aevi1t7mVNc') returning id into uid;
  insert into public.tune_credits (tune_id, person_id, role) values (uid, (select id from public.people where name = 'Craig Taubman'), 'composer') on conflict do nothing;
  -- tune Adon Olam (Gerovitsch)
  insert into public.tunes (name, meter, year, notes, recording_url) values ('Adon Olam (Gerovitsch)', null, 1897, null, 'https://www.youtube.com/watch?v=G4eEhrTyI9E') returning id into uid;
  insert into public.tune_credits (tune_id, person_id, role) values (uid, (select id from public.people where name = 'Eliezer Mordecai Gerovitsch'), 'composer') on conflict do nothing;
  insert into public.tune_tags (tune_id, tag_id) select uid, id from public.tags where type = 'community' and name = 'Ashkenazi' on conflict do nothing;
  -- tune Adon Olam (Hitman)
  insert into public.tunes (name, meter, year, notes, recording_url) values ('Adon Olam (Hitman)', null, 1976, null, 'https://www.youtube.com/watch?v=IKIKTMRzkBA') returning id into uid;
  insert into public.tune_credits (tune_id, person_id, role) values (uid, (select id from public.people where name = 'Uzi Hitman'), 'composer') on conflict do nothing;
  insert into public.tune_tags (tune_id, tag_id) select uid, id from public.tags where type = 'culture' and name = 'Israeli' on conflict do nothing;
  -- tune Oseh Shalom (Hirsh)
  insert into public.tunes (name, meter, year, notes, recording_url) values ('Oseh Shalom (Hirsh)', null, 1969, null, 'https://www.youtube.com/watch?v=MW5WtyAotrE') returning id into uid;
  insert into public.tune_credits (tune_id, person_id, role) values (uid, (select id from public.people where name = 'Nurit Hirsh'), 'composer') on conflict do nothing;
  insert into public.tune_tags (tune_id, tag_id) select uid, id from public.tags where type = 'culture' and name = 'Israeli' on conflict do nothing;
  -- tune Oseh Shalom (Friedman)
  insert into public.tunes (name, meter, year, notes, recording_url) values ('Oseh Shalom (Friedman)', null, null, null, 'https://www.youtube.com/watch?v=JIk1qdqDdjo') returning id into uid;
  insert into public.tune_credits (tune_id, person_id, role) values (uid, (select id from public.people where name = 'Debbie Friedman'), 'composer') on conflict do nothing;
  -- tune Ma'oz Tzur (Ashkenazi)
  insert into public.tunes (name, meter, year, notes, recording_url) values ('Ma''oz Tzur (Ashkenazi)', null, null, 'The traditional Ashkenazi melody.', 'https://www.youtube.com/watch?v=Bl8M--VqjW0') returning id into uid;
  insert into public.tune_credits (tune_id, person_id, role) values (uid, (select id from public.people where name = 'Traditional'), 'composer') on conflict do nothing;
  insert into public.tune_tags (tune_id, tag_id) select uid, id from public.tags where type = 'community' and name = 'Ashkenazi' on conflict do nothing;
  -- tune Yedid Nefesh (Zweig)
  insert into public.tunes (name, meter, year, notes, recording_url) values ('Yedid Nefesh (Zweig)', null, 1970, null, 'https://www.youtube.com/watch?v=m1b1TK-gI1I') returning id into uid;
  insert into public.tune_credits (tune_id, person_id, role) values (uid, (select id from public.people where name = 'Sara Zweig'), 'composer') on conflict do nothing;
  insert into public.tune_credits (tune_id, person_id, role) values (uid, (select id from public.people where name = 'Ehud Zweig'), 'composer') on conflict do nothing;
  insert into public.tune_tags (tune_id, tag_id) select uid, id from public.tags where type = 'culture' and name = 'Israeli' on conflict do nothing;
  -- tune Los Bilbilicos
  insert into public.tunes (name, meter, year, notes, recording_url) values ('Los Bilbilicos', null, null, 'Ladino song melody, also sung to Tzur Mishelo.', 'https://www.youtube.com/watch?v=u5vWt-b6La4') returning id into uid;
  insert into public.tune_credits (tune_id, person_id, role) values (uid, (select id from public.people where name = 'Traditional'), 'composer') on conflict do nothing;
  insert into public.tune_tags (tune_id, tag_id) select uid, id from public.tags where type = 'community' and name = 'Sephardi' on conflict do nothing;
  -- tune Hinei Ma Tov (Jacobson)
  insert into public.tunes (name, meter, year, notes, recording_url) values ('Hinei Ma Tov (Jacobson)', null, null, null, 'https://www.youtube.com/watch?v=Xe3ZHgz64Zc') returning id into uid;
  insert into public.tune_credits (tune_id, person_id, role) values (uid, (select id from public.people where name = 'Moshe Jacobson'), 'composer') on conflict do nothing;
  insert into public.tune_tags (tune_id, tag_id) select uid, id from public.tags where type = 'culture' and name = 'Israeli' on conflict do nothing;
  -- tune Esa Einai (Carlebach)
  insert into public.tunes (name, meter, year, notes, recording_url) values ('Esa Einai (Carlebach)', null, null, null, 'https://www.youtube.com/watch?v=9uk2GLTZyg0') returning id into uid;
  insert into public.tune_credits (tune_id, person_id, role) values (uid, (select id from public.people where name = 'Shlomo Carlebach'), 'composer') on conflict do nothing;
  insert into public.tune_tags (tune_id, tag_id) select uid, id from public.tags where type = 'community' and name = 'Carlebach' on conflict do nothing;
  -- tune Eli, Eli (Zehavi)
  insert into public.tunes (name, meter, year, notes, recording_url) values ('Eli, Eli (Zehavi)', null, 1945, null, 'https://www.youtube.com/watch?v=LbLicNwu0Ns') returning id into uid;
  insert into public.tune_credits (tune_id, person_id, role) values (uid, (select id from public.people where name = 'David Zehavi'), 'composer') on conflict do nothing;
  insert into public.tune_tags (tune_id, tag_id) select uid, id from public.tags where type = 'culture' and name = 'Israeli' on conflict do nothing;
  -- tune Am Yisrael Chai (Carlebach)
  insert into public.tunes (name, meter, year, notes, recording_url) values ('Am Yisrael Chai (Carlebach)', null, 1965, null, 'https://www.youtube.com/watch?v=wkLJgK0HfqI') returning id into uid;
  insert into public.tune_credits (tune_id, person_id, role) values (uid, (select id from public.people where name = 'Shlomo Carlebach'), 'composer') on conflict do nothing;
  insert into public.tune_tags (tune_id, tag_id) select uid, id from public.tags where type = 'community' and name = 'Carlebach' on conflict do nothing;
  -- tune Etz Chayim Hi (Portnoy)
  insert into public.tunes (name, meter, year, notes, recording_url) values ('Etz Chayim Hi (Portnoy)', null, 1975, null, 'https://www.youtube.com/watch?v=4LRKx-5ENJM') returning id into uid;
  insert into public.tune_credits (tune_id, person_id, role) values (uid, (select id from public.people where name = 'Tanchum Portnoy'), 'composer') on conflict do nothing;
  update public.tunes set recording_url = 'https://www.youtube.com/watch?v=LzsVkJciwfw' where name = 'Slane' and recording_url is null;
  -- Love Divine, All Loves Excelling / Beecher
  insert into public.songs (title, first_line, youtube_url, known_by_recording, text_id, tune_id)
  select 'Love Divine, All Loves Excelling', coalesce('Love divine, all loves excelling, joy of heaven, to earth come down', x.first_line), 'https://www.youtube.com/watch?v=AjInv0aBREk', false, x.id, (select id from public.tunes where name = 'Beecher')
  from public.texts x where x.title = 'Love Divine, All Loves Excelling' returning id into sid;
  insert into public.song_composers (song_id, person_id) values (sid, (select id from public.people where name = 'John Zundel')) on conflict do nothing;
  insert into public.song_lyricists (song_id, person_id) values (sid, (select id from public.people where name = 'Charles Wesley')) on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'community' and name = 'Christian' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'language' and name = 'English' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'form' and name = 'Hymn' on conflict do nothing;
  -- Love Divine, All Loves Excelling / Hyfrydol
  insert into public.songs (title, first_line, youtube_url, known_by_recording, text_id, tune_id)
  select 'Love Divine, All Loves Excelling', coalesce('Love divine, all loves excelling, joy of heaven, to earth come down', x.first_line), 'https://www.youtube.com/watch?v=jPdVaL6wh-U', false, x.id, (select id from public.tunes where name = 'Hyfrydol')
  from public.texts x where x.title = 'Love Divine, All Loves Excelling' returning id into sid;
  insert into public.song_composers (song_id, person_id) values (sid, (select id from public.people where name = 'Rowland Hugh Prichard')) on conflict do nothing;
  insert into public.song_lyricists (song_id, person_id) values (sid, (select id from public.people where name = 'Charles Wesley')) on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'community' and name = 'Christian' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'language' and name = 'English' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'form' and name = 'Hymn' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'music' from public.tags where type = 'culture' and name = 'Welsh' on conflict do nothing;
  -- Love Divine, All Loves Excelling / Blaenwern
  insert into public.songs (title, first_line, youtube_url, known_by_recording, text_id, tune_id)
  select 'Love Divine, All Loves Excelling', coalesce('Love divine, all loves excelling, joy of heaven, to earth come down', x.first_line), 'https://www.youtube.com/watch?v=0gvCODgV1fc', false, x.id, (select id from public.tunes where name = 'Blaenwern')
  from public.texts x where x.title = 'Love Divine, All Loves Excelling' returning id into sid;
  insert into public.song_composers (song_id, person_id) values (sid, (select id from public.people where name = 'William Rowlands')) on conflict do nothing;
  insert into public.song_lyricists (song_id, person_id) values (sid, (select id from public.people where name = 'Charles Wesley')) on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'community' and name = 'Christian' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'language' and name = 'English' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'form' and name = 'Hymn' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'music' from public.tags where type = 'culture' and name = 'Welsh' on conflict do nothing;
  -- Come, Thou Long-Expected Jesus / Hyfrydol
  insert into public.songs (title, first_line, youtube_url, known_by_recording, text_id, tune_id)
  select 'Come, Thou Long-Expected Jesus', coalesce('Come, thou long-expected Jesus, born to set thy people free', x.first_line), 'https://www.youtube.com/watch?v=8mT-rPPQpmA', false, x.id, (select id from public.tunes where name = 'Hyfrydol')
  from public.texts x where x.title = 'Come, Thou Long-Expected Jesus' returning id into sid;
  insert into public.song_composers (song_id, person_id) values (sid, (select id from public.people where name = 'Rowland Hugh Prichard')) on conflict do nothing;
  insert into public.song_lyricists (song_id, person_id) values (sid, (select id from public.people where name = 'Charles Wesley')) on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'community' and name = 'Christian' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'language' and name = 'English' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'form' and name = 'Hymn' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'occasion' and name = 'Advent' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'music' from public.tags where type = 'culture' and name = 'Welsh' on conflict do nothing;
  -- Come, Thou Long-Expected Jesus / Stuttgart
  insert into public.songs (title, first_line, youtube_url, known_by_recording, text_id, tune_id)
  select 'Come, Thou Long-Expected Jesus', coalesce('Come, thou long-expected Jesus, born to set thy people free', x.first_line), 'https://www.youtube.com/watch?v=z_YA9GZB76I', false, x.id, (select id from public.tunes where name = 'Stuttgart')
  from public.texts x where x.title = 'Come, Thou Long-Expected Jesus' returning id into sid;
  insert into public.song_lyricists (song_id, person_id) values (sid, (select id from public.people where name = 'Charles Wesley')) on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'community' and name = 'Christian' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'language' and name = 'English' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'form' and name = 'Hymn' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'occasion' and name = 'Advent' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'music' from public.tags where type = 'culture' and name = 'German' on conflict do nothing;
  -- Alleluia! Sing to Jesus / Hyfrydol
  insert into public.songs (title, first_line, youtube_url, known_by_recording, text_id, tune_id)
  select 'Alleluia! Sing to Jesus', coalesce('Alleluia! Sing to Jesus! His the scepter, his the throne', x.first_line), 'https://www.youtube.com/watch?v=UJDWFYIkBns', false, x.id, (select id from public.tunes where name = 'Hyfrydol')
  from public.texts x where x.title = 'Alleluia! Sing to Jesus' returning id into sid;
  insert into public.song_composers (song_id, person_id) values (sid, (select id from public.people where name = 'Rowland Hugh Prichard')) on conflict do nothing;
  insert into public.song_lyricists (song_id, person_id) values (sid, (select id from public.people where name = 'William Chatterton Dix')) on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'community' and name = 'Christian' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'language' and name = 'English' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'form' and name = 'Hymn' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'music' from public.tags where type = 'culture' and name = 'Welsh' on conflict do nothing;
  -- O Little Town of Bethlehem / St. Louis
  insert into public.songs (title, first_line, youtube_url, known_by_recording, text_id, tune_id)
  select 'O Little Town of Bethlehem', coalesce('O little town of Bethlehem, how still we see thee lie', x.first_line), 'https://www.youtube.com/watch?v=OPNDuSFrOZ4', false, x.id, (select id from public.tunes where name = 'St. Louis')
  from public.texts x where x.title = 'O Little Town of Bethlehem' returning id into sid;
  insert into public.song_composers (song_id, person_id) values (sid, (select id from public.people where name = 'Lewis H. Redner')) on conflict do nothing;
  insert into public.song_lyricists (song_id, person_id) values (sid, (select id from public.people where name = 'Phillips Brooks')) on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'community' and name = 'Christian' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'language' and name = 'English' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'form' and name = 'Hymn' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'form' and name = 'Carol' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'occasion' and name = 'Christmas' on conflict do nothing;
  -- O Little Town of Bethlehem / Forest Green
  insert into public.songs (title, first_line, youtube_url, known_by_recording, text_id, tune_id)
  select 'O Little Town of Bethlehem', coalesce('O little town of Bethlehem, how still we see thee lie', x.first_line), 'https://www.youtube.com/watch?v=H_q430z13oc', false, x.id, (select id from public.tunes where name = 'Forest Green')
  from public.texts x where x.title = 'O Little Town of Bethlehem' returning id into sid;
  insert into public.song_composers (song_id, person_id) values (sid, (select id from public.people where name = 'Traditional')) on conflict do nothing;
  insert into public.song_composers (song_id, person_id) values (sid, (select id from public.people where name = 'Ralph Vaughan Williams')) on conflict do nothing;
  insert into public.song_lyricists (song_id, person_id) values (sid, (select id from public.people where name = 'Phillips Brooks')) on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'community' and name = 'Christian' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'language' and name = 'English' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'form' and name = 'Hymn' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'form' and name = 'Carol' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'occasion' and name = 'Christmas' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'music' from public.tags where type = 'culture' and name = 'English' on conflict do nothing;
  -- O Little Town of Bethlehem / Kingsfold
  insert into public.songs (title, first_line, youtube_url, known_by_recording, text_id, tune_id)
  select 'O Little Town of Bethlehem', coalesce('O little town of Bethlehem, how still we see thee lie', x.first_line), null, false, x.id, (select id from public.tunes where name = 'Kingsfold')
  from public.texts x where x.title = 'O Little Town of Bethlehem' returning id into sid;
  insert into public.song_composers (song_id, person_id) values (sid, (select id from public.people where name = 'Traditional')) on conflict do nothing;
  insert into public.song_composers (song_id, person_id) values (sid, (select id from public.people where name = 'Ralph Vaughan Williams')) on conflict do nothing;
  insert into public.song_lyricists (song_id, person_id) values (sid, (select id from public.people where name = 'Phillips Brooks')) on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'community' and name = 'Christian' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'language' and name = 'English' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'form' and name = 'Hymn' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'form' and name = 'Carol' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'occasion' and name = 'Christmas' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'music' from public.tags where type = 'culture' and name = 'English' on conflict do nothing;
  -- It Came Upon the Midnight Clear / Carol
  insert into public.songs (title, first_line, youtube_url, known_by_recording, text_id, tune_id)
  select 'It Came Upon the Midnight Clear', coalesce('It came upon the midnight clear, that glorious song of old', x.first_line), 'https://www.youtube.com/watch?v=Ljrf6G1kmto', false, x.id, (select id from public.tunes where name = 'Carol')
  from public.texts x where x.title = 'It Came Upon the Midnight Clear' returning id into sid;
  insert into public.song_composers (song_id, person_id) values (sid, (select id from public.people where name = 'Richard Storrs Willis')) on conflict do nothing;
  insert into public.song_lyricists (song_id, person_id) values (sid, (select id from public.people where name = 'Edmund H. Sears')) on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'community' and name = 'Christian' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'language' and name = 'English' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'form' and name = 'Hymn' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'form' and name = 'Carol' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'occasion' and name = 'Christmas' on conflict do nothing;
  -- It Came Upon the Midnight Clear / Noel
  insert into public.songs (title, first_line, youtube_url, known_by_recording, text_id, tune_id)
  select 'It Came Upon the Midnight Clear', coalesce('It came upon the midnight clear, that glorious song of old', x.first_line), 'https://www.youtube.com/watch?v=cX4LUpOMUBs', false, x.id, (select id from public.tunes where name = 'Noel')
  from public.texts x where x.title = 'It Came Upon the Midnight Clear' returning id into sid;
  insert into public.song_composers (song_id, person_id) values (sid, (select id from public.people where name = 'Arthur Sullivan')) on conflict do nothing;
  insert into public.song_lyricists (song_id, person_id) values (sid, (select id from public.people where name = 'Edmund H. Sears')) on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'community' and name = 'Christian' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'language' and name = 'English' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'form' and name = 'Hymn' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'form' and name = 'Carol' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'occasion' and name = 'Christmas' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'music' from public.tags where type = 'culture' and name = 'English' on conflict do nothing;
  -- Away in a Manger / Mueller
  insert into public.songs (title, first_line, youtube_url, known_by_recording, text_id, tune_id)
  select 'Away in a Manger', coalesce('Away in a manger, no crib for a bed', x.first_line), 'https://www.youtube.com/watch?v=dB9zvdegifU', false, x.id, (select id from public.tunes where name = 'Mueller')
  from public.texts x where x.title = 'Away in a Manger' returning id into sid;
  insert into public.song_composers (song_id, person_id) values (sid, (select id from public.people where name = 'James R. Murray')) on conflict do nothing;
  insert into public.song_lyricists (song_id, person_id) values (sid, (select id from public.people where name = 'Traditional')) on conflict do nothing;
  insert into public.song_lyricists (song_id, person_id) values (sid, (select id from public.people where name = 'John T. McFarland')) on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'community' and name = 'Christian' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'language' and name = 'English' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'form' and name = 'Hymn' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'form' and name = 'Carol' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'occasion' and name = 'Christmas' on conflict do nothing;
  -- Away in a Manger / Cradle Song
  insert into public.songs (title, first_line, youtube_url, known_by_recording, text_id, tune_id)
  select 'Away in a Manger', coalesce('Away in a manger, no crib for a bed', x.first_line), 'https://www.youtube.com/watch?v=iI8-tExjktI', false, x.id, (select id from public.tunes where name = 'Cradle Song')
  from public.texts x where x.title = 'Away in a Manger' returning id into sid;
  insert into public.song_composers (song_id, person_id) values (sid, (select id from public.people where name = 'William J. Kirkpatrick')) on conflict do nothing;
  insert into public.song_lyricists (song_id, person_id) values (sid, (select id from public.people where name = 'Traditional')) on conflict do nothing;
  insert into public.song_lyricists (song_id, person_id) values (sid, (select id from public.people where name = 'John T. McFarland')) on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'community' and name = 'Christian' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'language' and name = 'English' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'form' and name = 'Hymn' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'form' and name = 'Carol' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'occasion' and name = 'Christmas' on conflict do nothing;
  -- I Heard the Voice of Jesus Say / Kingsfold
  insert into public.songs (title, first_line, youtube_url, known_by_recording, text_id, tune_id)
  select 'I Heard the Voice of Jesus Say', coalesce('I heard the voice of Jesus say, "Come unto me and rest"', x.first_line), 'https://www.youtube.com/watch?v=TrTZklB-JVk', false, x.id, (select id from public.tunes where name = 'Kingsfold')
  from public.texts x where x.title = 'I Heard the Voice of Jesus Say' returning id into sid;
  insert into public.song_composers (song_id, person_id) values (sid, (select id from public.people where name = 'Traditional')) on conflict do nothing;
  insert into public.song_composers (song_id, person_id) values (sid, (select id from public.people where name = 'Ralph Vaughan Williams')) on conflict do nothing;
  insert into public.song_lyricists (song_id, person_id) values (sid, (select id from public.people where name = 'Horatius Bonar')) on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'community' and name = 'Christian' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'language' and name = 'English' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'form' and name = 'Hymn' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'music' from public.tags where type = 'culture' and name = 'English' on conflict do nothing;
  -- I Heard the Voice of Jesus Say / Vox Dilecti
  insert into public.songs (title, first_line, youtube_url, known_by_recording, text_id, tune_id)
  select 'I Heard the Voice of Jesus Say', coalesce('I heard the voice of Jesus say, "Come unto me and rest"', x.first_line), 'https://www.youtube.com/watch?v=GHylH7m8TeE', false, x.id, (select id from public.tunes where name = 'Vox Dilecti')
  from public.texts x where x.title = 'I Heard the Voice of Jesus Say' returning id into sid;
  insert into public.song_composers (song_id, person_id) values (sid, (select id from public.people where name = 'John B. Dykes')) on conflict do nothing;
  insert into public.song_lyricists (song_id, person_id) values (sid, (select id from public.people where name = 'Horatius Bonar')) on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'community' and name = 'Christian' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'language' and name = 'English' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'form' and name = 'Hymn' on conflict do nothing;
  -- Lord of All Hopefulness / Slane
  insert into public.songs (title, first_line, youtube_url, known_by_recording, text_id, tune_id)
  select 'Lord of All Hopefulness', coalesce('Lord of all hopefulness, Lord of all joy', x.first_line), 'https://www.youtube.com/watch?v=LzsVkJciwfw', false, x.id, (select id from public.tunes where name = 'Slane')
  from public.texts x where x.title = 'Lord of All Hopefulness' returning id into sid;
  insert into public.song_composers (song_id, person_id) values (sid, (select id from public.people where name = 'Traditional')) on conflict do nothing;
  insert into public.song_lyricists (song_id, person_id) values (sid, (select id from public.people where name = 'Jan Struther')) on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'community' and name = 'Christian' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'language' and name = 'English' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'form' and name = 'Hymn' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'music' from public.tags where type = 'culture' and name = 'Irish' on conflict do nothing;
  -- O God, Our Help in Ages Past / St. Anne
  insert into public.songs (title, first_line, youtube_url, known_by_recording, text_id, tune_id)
  select 'O God, Our Help in Ages Past', coalesce('O God, our help in ages past, our hope for years to come', x.first_line), 'https://www.youtube.com/watch?v=fyXM83T9u54', false, x.id, (select id from public.tunes where name = 'St. Anne')
  from public.texts x where x.title = 'O God, Our Help in Ages Past' returning id into sid;
  insert into public.song_composers (song_id, person_id) values (sid, (select id from public.people where name = 'William Croft')) on conflict do nothing;
  insert into public.song_lyricists (song_id, person_id) values (sid, (select id from public.people where name = 'Isaac Watts')) on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'community' and name = 'Christian' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'language' and name = 'English' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'form' and name = 'Hymn' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'form' and name = 'Psalm setting' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'music' from public.tags where type = 'culture' and name = 'English' on conflict do nothing;
  -- Joyful, Joyful, We Adore Thee / Hymn to Joy
  insert into public.songs (title, first_line, youtube_url, known_by_recording, text_id, tune_id)
  select 'Joyful, Joyful, We Adore Thee', coalesce('Joyful, joyful, we adore thee, God of glory, Lord of love', x.first_line), 'https://www.youtube.com/watch?v=0lPpMyooeY0', false, x.id, (select id from public.tunes where name = 'Hymn to Joy')
  from public.texts x where x.title = 'Joyful, Joyful, We Adore Thee' returning id into sid;
  insert into public.song_composers (song_id, person_id) values (sid, (select id from public.people where name = 'Ludwig van Beethoven')) on conflict do nothing;
  insert into public.song_composers (song_id, person_id) values (sid, (select id from public.people where name = 'Edward Hodges')) on conflict do nothing;
  insert into public.song_lyricists (song_id, person_id) values (sid, (select id from public.people where name = 'Henry van Dyke')) on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'community' and name = 'Christian' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'language' and name = 'English' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'form' and name = 'Hymn' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'music' from public.tags where type = 'culture' and name = 'German' on conflict do nothing;
  -- Shalom Aleichem / Shalom Aleichem (Goldfarb)
  insert into public.songs (title, first_line, youtube_url, known_by_recording, text_id, tune_id)
  select 'Shalom Aleichem', coalesce('Shalom aleichem, malachei hashareit, malachei elyon', x.first_line), 'https://www.youtube.com/watch?v=qmDYpf46Kyw', false, x.id, (select id from public.tunes where name = 'Shalom Aleichem (Goldfarb)')
  from public.texts x where x.title = 'Shalom Aleichem' returning id into sid;
  insert into public.song_composers (song_id, person_id) values (sid, (select id from public.people where name = 'Israel Goldfarb')) on conflict do nothing;
  insert into public.song_composers (song_id, person_id) values (sid, (select id from public.people where name = 'Samuel E. Goldfarb')) on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'community' and name = 'Jewish' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'language' and name = 'Hebrew' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'form' and name = 'Zemer' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'occasion' and name = 'Shabbat table (zemirot)' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'music' from public.tags where type = 'community' and name = 'Ashkenazi' on conflict do nothing;
  -- Shalom Aleichem / Shalom Aleichem (Shmuel Brazil)
  insert into public.songs (title, first_line, youtube_url, known_by_recording, text_id, tune_id)
  select 'Shalom Aleichem', coalesce('Shalom aleichem, malachei hashareit, malachei elyon', x.first_line), 'https://www.youtube.com/watch?v=akcC2GlBmNk', false, x.id, (select id from public.tunes where name = 'Shalom Aleichem (Shmuel Brazil)')
  from public.texts x where x.title = 'Shalom Aleichem' returning id into sid;
  insert into public.song_composers (song_id, person_id) values (sid, (select id from public.people where name = 'Shmuel Brazil')) on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'community' and name = 'Jewish' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'language' and name = 'Hebrew' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'form' and name = 'Zemer' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'occasion' and name = 'Shabbat table (zemirot)' on conflict do nothing;
  -- Shalom Aleichem / Kuando el Rey Nimrod
  insert into public.songs (title, first_line, youtube_url, known_by_recording, text_id, tune_id)
  select 'Shalom Aleichem', coalesce('Shalom aleichem, malachei hashareit, malachei elyon', x.first_line), 'https://www.youtube.com/watch?v=woUbBu_Q1sg', false, x.id, (select id from public.tunes where name = 'Kuando el Rey Nimrod')
  from public.texts x where x.title = 'Shalom Aleichem' returning id into sid;
  insert into public.song_composers (song_id, person_id) values (sid, (select id from public.people where name = 'Traditional')) on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'community' and name = 'Jewish' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'language' and name = 'Hebrew' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'form' and name = 'Zemer' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'occasion' and name = 'Shabbat table (zemirot)' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'music' from public.tags where type = 'community' and name = 'Moroccan' on conflict do nothing;
  -- Lecha Dodi / Lecha Dodi (Taubman)
  insert into public.songs (title, first_line, youtube_url, known_by_recording, text_id, tune_id)
  select 'Lecha Dodi', coalesce('L''cha dodi likrat kala, p''nei Shabbat n''kab''lah', x.first_line), 'https://www.youtube.com/watch?v=aevi1t7mVNc', false, x.id, (select id from public.tunes where name = 'Lecha Dodi (Taubman)')
  from public.texts x where x.title = 'Lecha Dodi' returning id into sid;
  insert into public.song_composers (song_id, person_id) values (sid, (select id from public.people where name = 'Craig Taubman')) on conflict do nothing;
  insert into public.song_lyricists (song_id, person_id) values (sid, (select id from public.people where name = 'Shlomo Halevi Alkabetz')) on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'community' and name = 'Jewish' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'language' and name = 'Hebrew' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'form' and name = 'Piyyut' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'occasion' and name = 'Friday night (Kabbalat Shabbat)' on conflict do nothing;
  -- Adon Olam / Adon Olam (Gerovitsch)
  insert into public.songs (title, first_line, youtube_url, known_by_recording, text_id, tune_id)
  select 'Adon Olam', coalesce('Adon olam asher malach', x.first_line), 'https://www.youtube.com/watch?v=G4eEhrTyI9E', false, x.id, (select id from public.tunes where name = 'Adon Olam (Gerovitsch)')
  from public.texts x where x.title = 'Adon Olam' returning id into sid;
  insert into public.song_composers (song_id, person_id) values (sid, (select id from public.people where name = 'Eliezer Mordecai Gerovitsch')) on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'community' and name = 'Jewish' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'language' and name = 'Hebrew' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'form' and name = 'Piyyut' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'occasion' and name = 'Shabbat' on conflict do nothing;
  -- Adon Olam / Adon Olam (Hitman)
  insert into public.songs (title, first_line, youtube_url, known_by_recording, text_id, tune_id)
  select 'Adon Olam', coalesce('Adon olam asher malach', x.first_line), 'https://www.youtube.com/watch?v=IKIKTMRzkBA', false, x.id, (select id from public.tunes where name = 'Adon Olam (Hitman)')
  from public.texts x where x.title = 'Adon Olam' returning id into sid;
  insert into public.song_composers (song_id, person_id) values (sid, (select id from public.people where name = 'Uzi Hitman')) on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'community' and name = 'Jewish' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'language' and name = 'Hebrew' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'form' and name = 'Piyyut' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'occasion' and name = 'Shabbat' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'music' from public.tags where type = 'culture' and name = 'Israeli' on conflict do nothing;
  -- Oseh Shalom / Oseh Shalom (Hirsh)
  insert into public.songs (title, first_line, youtube_url, known_by_recording, text_id, tune_id)
  select 'Oseh Shalom', coalesce('Oseh shalom bimromav', x.first_line), 'https://www.youtube.com/watch?v=MW5WtyAotrE', false, x.id, (select id from public.tunes where name = 'Oseh Shalom (Hirsh)')
  from public.texts x where x.title = 'Oseh Shalom' returning id into sid;
  insert into public.song_composers (song_id, person_id) values (sid, (select id from public.people where name = 'Nurit Hirsh')) on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'community' and name = 'Jewish' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'language' and name = 'Hebrew' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'form' and name = 'Liturgical setting' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'music' from public.tags where type = 'culture' and name = 'Israeli' on conflict do nothing;
  -- Oseh Shalom / Oseh Shalom (Friedman)
  insert into public.songs (title, first_line, youtube_url, known_by_recording, text_id, tune_id)
  select 'Oseh Shalom', coalesce('Oseh shalom bimromav', x.first_line), 'https://www.youtube.com/watch?v=JIk1qdqDdjo', false, x.id, (select id from public.tunes where name = 'Oseh Shalom (Friedman)')
  from public.texts x where x.title = 'Oseh Shalom' returning id into sid;
  insert into public.song_composers (song_id, person_id) values (sid, (select id from public.people where name = 'Debbie Friedman')) on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'community' and name = 'Jewish' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'language' and name = 'Hebrew' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'form' and name = 'Liturgical setting' on conflict do nothing;
  -- Ma'oz Tzur / Ma'oz Tzur (Ashkenazi)
  insert into public.songs (title, first_line, youtube_url, known_by_recording, text_id, tune_id)
  select 'Ma''oz Tzur', coalesce('Ma''oz tzur yeshu''ati, lecha na''eh leshabei''ach', x.first_line), 'https://www.youtube.com/watch?v=Bl8M--VqjW0', false, x.id, (select id from public.tunes where name = 'Ma''oz Tzur (Ashkenazi)')
  from public.texts x where x.title = 'Ma''oz Tzur' returning id into sid;
  insert into public.song_composers (song_id, person_id) values (sid, (select id from public.people where name = 'Traditional')) on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'community' and name = 'Jewish' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'language' and name = 'Hebrew' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'form' and name = 'Piyyut' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'occasion' and name = 'Hanukkah' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'music' from public.tags where type = 'community' and name = 'Ashkenazi' on conflict do nothing;
  -- Yedid Nefesh / Yedid Nefesh (Zweig)
  insert into public.songs (title, first_line, youtube_url, known_by_recording, text_id, tune_id)
  select 'Yedid Nefesh', coalesce('Yedid nefesh, Av harachaman', x.first_line), 'https://www.youtube.com/watch?v=m1b1TK-gI1I', false, x.id, (select id from public.tunes where name = 'Yedid Nefesh (Zweig)')
  from public.texts x where x.title = 'Yedid Nefesh' returning id into sid;
  insert into public.song_composers (song_id, person_id) values (sid, (select id from public.people where name = 'Sara Zweig')) on conflict do nothing;
  insert into public.song_composers (song_id, person_id) values (sid, (select id from public.people where name = 'Ehud Zweig')) on conflict do nothing;
  insert into public.song_lyricists (song_id, person_id) values (sid, (select id from public.people where name = 'Elazar Azikri')) on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'community' and name = 'Jewish' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'language' and name = 'Hebrew' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'form' and name = 'Piyyut' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'occasion' and name = 'Friday night (Kabbalat Shabbat)' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'music' from public.tags where type = 'culture' and name = 'Israeli' on conflict do nothing;
  -- Tzur Mishelo / Los Bilbilicos
  insert into public.songs (title, first_line, youtube_url, known_by_recording, text_id, tune_id)
  select 'Tzur Mishelo', coalesce('Tzur mishelo achalnu, bar''chu emunai', x.first_line), 'https://www.youtube.com/watch?v=u5vWt-b6La4', false, x.id, (select id from public.tunes where name = 'Los Bilbilicos')
  from public.texts x where x.title = 'Tzur Mishelo' returning id into sid;
  insert into public.song_composers (song_id, person_id) values (sid, (select id from public.people where name = 'Traditional')) on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'community' and name = 'Jewish' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'language' and name = 'Hebrew' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'form' and name = 'Zemer' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'occasion' and name = 'Shabbat table (zemirot)' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'music' from public.tags where type = 'community' and name = 'Sephardi' on conflict do nothing;
  -- Hinei Ma Tov / Hinei Ma Tov (Jacobson)
  insert into public.songs (title, first_line, youtube_url, known_by_recording, text_id, tune_id)
  select 'Hinei Ma Tov', coalesce(null, x.first_line), 'https://www.youtube.com/watch?v=Xe3ZHgz64Zc', false, x.id, (select id from public.tunes where name = 'Hinei Ma Tov (Jacobson)')
  from public.texts x where x.title = 'Hinei Ma Tov' returning id into sid;
  insert into public.song_composers (song_id, person_id) values (sid, (select id from public.people where name = 'Moshe Jacobson')) on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'community' and name = 'Jewish' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'language' and name = 'Hebrew' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'form' and name = 'Psalm setting' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'music' from public.tags where type = 'culture' and name = 'Israeli' on conflict do nothing;
  -- Esa Einai / Esa Einai (Carlebach)
  insert into public.songs (title, first_line, youtube_url, known_by_recording, text_id, tune_id)
  select 'Esa Einai', coalesce('Esa einai el heharim, me''ayin yavo ezri', x.first_line), 'https://www.youtube.com/watch?v=9uk2GLTZyg0', false, x.id, (select id from public.tunes where name = 'Esa Einai (Carlebach)')
  from public.texts x where x.title = 'Esa Einai' returning id into sid;
  insert into public.song_composers (song_id, person_id) values (sid, (select id from public.people where name = 'Shlomo Carlebach')) on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'community' and name = 'Jewish' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'language' and name = 'Hebrew' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'form' and name = 'Psalm setting' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'music' from public.tags where type = 'community' and name = 'Carlebach' on conflict do nothing;
  -- Eli, Eli / Eli, Eli (Zehavi)
  insert into public.songs (title, first_line, youtube_url, known_by_recording, text_id, tune_id)
  select 'Eli, Eli', coalesce('Eli, Eli, shelo yigamer l''olam', x.first_line), 'https://www.youtube.com/watch?v=LbLicNwu0Ns', false, x.id, (select id from public.tunes where name = 'Eli, Eli (Zehavi)')
  from public.texts x where x.title = 'Eli, Eli' returning id into sid;
  insert into public.song_composers (song_id, person_id) values (sid, (select id from public.people where name = 'David Zehavi')) on conflict do nothing;
  insert into public.song_lyricists (song_id, person_id) values (sid, (select id from public.people where name = 'Hannah Szenes')) on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'community' and name = 'Jewish' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'language' and name = 'Hebrew' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'culture' and name = 'Israeli' on conflict do nothing;
  -- Am Yisrael Chai / Am Yisrael Chai (Carlebach)
  insert into public.songs (title, first_line, youtube_url, known_by_recording, text_id, tune_id)
  select 'Am Yisrael Chai', coalesce('Am Yisrael chai, od avinu chai', x.first_line), 'https://www.youtube.com/watch?v=wkLJgK0HfqI', false, x.id, (select id from public.tunes where name = 'Am Yisrael Chai (Carlebach)')
  from public.texts x where x.title = 'Am Yisrael Chai' returning id into sid;
  insert into public.song_composers (song_id, person_id) values (sid, (select id from public.people where name = 'Shlomo Carlebach')) on conflict do nothing;
  insert into public.song_lyricists (song_id, person_id) values (sid, (select id from public.people where name = 'Shlomo Carlebach')) on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'community' and name = 'Jewish' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'language' and name = 'Hebrew' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'music' from public.tags where type = 'community' and name = 'Carlebach' on conflict do nothing;
  -- Etz Chayim Hi / Etz Chayim Hi (Portnoy)
  insert into public.songs (title, first_line, youtube_url, known_by_recording, text_id, tune_id)
  select 'Etz Chayim Hi', coalesce('Etz chayim hi lamachazikim bah', x.first_line), 'https://www.youtube.com/watch?v=4LRKx-5ENJM', false, x.id, (select id from public.tunes where name = 'Etz Chayim Hi (Portnoy)')
  from public.texts x where x.title = 'Etz Chayim Hi' returning id into sid;
  insert into public.song_composers (song_id, person_id) values (sid, (select id from public.people where name = 'Tanchum Portnoy')) on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'community' and name = 'Jewish' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'language' and name = 'Hebrew' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'form' and name = 'Liturgical setting' on conflict do nothing;
  -- nigun Niggun Daled Bavos
  insert into public.songs (title, notes, youtube_url, known_by_recording) values ('Niggun Daled Bavos', 'The Alter Rebbe''s niggun of four stanzas, sung only on special occasions such as 19 Kislev and weddings.', 'https://www.youtube.com/watch?v=k4QDV-UJyY4', false) returning id into sid;
  insert into public.song_composers (song_id, person_id) values (sid, (select id from public.people where name = 'Shneur Zalman of Liadi')) on conflict do nothing;
  insert into public.song_alternate_titles (song_id, title) values (sid, 'Niggun of Four Stanzas') on conflict do nothing;
  insert into public.song_alternate_titles (song_id, title) values (sid, 'The Alter Rebbe''s Niggun') on conflict do nothing;
  insert into public.song_alternate_titles (song_id, title) values (sid, 'Daled Bavos') on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'community' and name = 'Jewish' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'form' and name = 'Nigun' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'community' and name = 'Chabad' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'community' and name = 'Hasidic' on conflict do nothing;
  -- nigun Lechatchila Ariber
  insert into public.songs (title, notes, youtube_url, known_by_recording) values ('Lechatchila Ariber', 'Associated with the fourth Chabad Rebbe, Shmuel Schneersohn (the Rebbe Maharash).', 'https://www.youtube.com/watch?v=qfNBv1Ns524', false) returning id into sid;
  insert into public.song_composers (song_id, person_id) values (sid, (select id from public.people where name = 'Traditional')) on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'community' and name = 'Jewish' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'form' and name = 'Nigun' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'community' and name = 'Chabad' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'community' and name = 'Hasidic' on conflict do nothing;
  -- nigun Rostover Niggun
  insert into public.songs (title, notes, youtube_url, known_by_recording) values ('Rostover Niggun', 'Associated with the fifth Chabad Rebbe, Sholom Dovber Schneersohn (the Rebbe Rashab), who is buried in Rostov.', 'https://www.youtube.com/watch?v=f8lMKpTxV7E', false) returning id into sid;
  insert into public.song_composers (song_id, person_id) values (sid, (select id from public.people where name = 'Traditional')) on conflict do nothing;
  insert into public.song_alternate_titles (song_id, title) values (sid, 'Rostover Nigun') on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'community' and name = 'Jewish' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'form' and name = 'Nigun' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'community' and name = 'Chabad' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'community' and name = 'Hasidic' on conflict do nothing;
  -- nigun Niggun of the Baal Shem Tov
  insert into public.songs (title, notes, youtube_url, known_by_recording) values ('Niggun of the Baal Shem Tov', 'Attributed by Chabad tradition to the Baal Shem Tov.', 'https://www.youtube.com/watch?v=vbqDy_ZXitY', false) returning id into sid;
  insert into public.song_composers (song_id, person_id) values (sid, (select id from public.people where name = 'Traditional')) on conflict do nothing;
  insert into public.song_alternate_titles (song_id, title) values (sid, 'Baal Shem Tov''s Niggun') on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'community' and name = 'Jewish' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'form' and name = 'Nigun' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'community' and name = 'Chabad' on conflict do nothing;
  insert into public.song_tags (song_id, tag_id, context) select sid, id, 'general' from public.tags where type = 'community' and name = 'Hasidic' on conflict do nothing;
end $$;
