// The vocabularies the automatic song fill may tag songs with: the names of the
// tags table (migration 202) by type. Tags are capped at 3 per song per type;
// anything outside these lists is never written.
export const SONG_TONALITIES = [
  "Major", "Minor", "Dorian", "Phrygian", "Lydian", "Mixolydian",
  "Aeolian", "Locrian", "Harmonic Minor", "Melodic Minor",
  "Pentatonic", "Blues", "Whole Tone", "Chromatic", "Modal",
];

export const SONG_METERS = ["4", "3", "5", "7", "9", "11", "Free", "Irregular"];

export const SONG_GENRES = [
  "Afropop", "Alternative Rock", "Americana", "Barbershop", "Bluegrass", "Blues", "Bossa Nova",
  "Broadway & Musical Theatre", "Cajun", "Calypso", "Cantorial", "Caribbean", "Celtic",
  "Children's Music", "Circle Songs", "Classic Rock", "Contemporary Christian", "Contemporary Gospel", "Contemporary Jewish",
  "Country", "Country Gospel", "Cowboy & Western", "Disco", "Disney & Animation", "Doo-Wop", "Emo", "Film",
  "Flamenco", "Folk", "Folk Rock", "Funk", "Gospel", "Grunge",
  "Hard Rock", "Heartland Rock", "Hip-Hop & Rap", "Indie Rock", "Israeli Folk", "Jam Band",
  "Jazz", "Jewish Music", "Kirtan", "Klezmer", "Latin", "Metal",
  "Motown", "New Wave", "Opera & Operetta", "Pop", "Progressive Rock", "Psychedelic Rock",
  "Punk", "Qawwali", "R&B", "Reggae", "Rock", "Rockabilly",
  "Roots Rock", "Sacred", "Salsa", "Ska", "Soft Rock", "Soul",
  "Southern Gospel", "Spiritual", "Stage & Screen", "Traditional Gospel", "TV", "Zydeco",
];

export const SONG_THEMES = [
  "Addiction", "Aging", "Betrayal", "Celebration", "Childhood", "City Life", "Coming of Age",
  "Courage", "Dancing", "Death", "Drinking", "Dreams", "Exile", "Faith", "Family", "Fantasy",
  "Forgiveness", "Freedom", "Friendship", "Heartbreak", "History", "Home", "Hope", "Humor", "Identity",
  "Immigration", "Joy", "Justice", "Labor", "Loneliness", "Longing", "Loss", "Love", "Memory", "Music",
  "Mythology", "Nature", "Nostalgia", "Parenthood", "Peace", "Politics", "Poverty", "Pride",
  "Race", "Rebellion", "Romance", "Rural Life", "Satire", "Sea", "Seasons",
  "Shame", "Spirituality", "Storytelling", "Struggle", "Time", "Travel", "Unity", "Wandering",
  "War", "Wealth", "Work", "Youth",
];

// Where a song comes from: nationality, ethnicity or region. Religious traditions are communities.
export const SONG_CULTURES = [
  "Aboriginal Australian", "African American", "African Traditional", "American", "Appalachian",
  "Arab", "Argentine", "Australian", "Bahamian", "Bangladeshi", "Belgian", "Brazilian", "Cajun",
  "Cambodian", "Cameroonian", "Canadian", "Chilean", "Chinese", "Colombian", "Creole", "Cuban",
  "Czech", "Danish", "Dutch", "East African", "Egyptian", "English", "Ethiopian", "Filipino",
  "Finnish", "First Nations/Native American", "French", "German", "Ghanaian", "Greek",
  "Gullah Geechee", "Haitian", "Hawaiian", "Hungarian", "Icelandic", "Indian", "Indonesian", "Irish",
  "Israeli", "Italian", "Jamaican", "Japanese", "Kenyan", "Korean", "Latin American", "Mexican",
  "Māori", "Nepali", "New Zealand", "Nigerian", "Norwegian", "Pakistani", "Peruvian", "Polish",
  "Portuguese", "Puerto Rican", "Romani", "Romanian", "Russian", "Scandinavian", "Scottish",
  "South African", "Spanish", "Sri Lankan", "Swedish", "Swiss", "Tex-Mex", "Thai", "Trinidadian",
  "Turkish", "Ukrainian", "Venezuelan", "Vietnamese", "Welsh", "West African", "Yoruba", "Zulu",
];

// What kind of piece a song is, separate from its musical style.
export const SONG_FORMS = [
  "Action song", "Anthem", "Ballad", "Barbershop tag", "Call and response", "Carol", "Chant",
  "Circle song", "Cumulative song", "Drinking song", "Freedom song", "Hymn", "Lament", "Lined hymn",
  "Liturgical setting", "Lullaby", "Mantra", "Nigun", "Nursery rhyme", "Piyyut", "Psalm setting",
  "Round / Canon", "Sea song", "Shanty", "Singing game", "Work song", "Worship song", "Zemer",
];

// When a song is sung. The group headings (Gatherings, Life events, …) are left out: tag the specific occasion.
export const SONG_OCCASIONS = [
  "Advent", "Anniversary", "Baby naming", "Baptism", "Bar/Bat Mitzvah", "Bedside / hospice", "Birthday",
  "Campfire", "Christmas", "Communion", "Easter", "Epiphany", "Friday night (Kabbalat Shabbat)", "Funeral and memorial",
  "Graduation", "Halloween", "Hanukkah", "Havdalah", "Holy Week", "Hymn sing",
  "Kumzitz", "Lent", "New Year", "Passover", "Pentecost", "Protest and march",
  "Pub sing", "Purim", "Retreat", "Rosh Hashanah", "Shabbat", "Shabbat table (zemirot)",
  "Shavuot", "Simchat Torah", "Singalong / hootenanny", "Song circle", "Sukkot", "Summer camp",
  "Thanksgiving", "Tisch", "Tu BiShvat", "Wedding", "Worship service", "Yom Kippur",
];

// Religious traditions and the communities inside them. The "Jewish movements" and "Anabaptist" headings are left out.
export const SONG_COMMUNITIES = [
  "Amish", "Anglican/Episcopal", "Antiochian Orthodox", "Ashkenazi", "Baptist", "Black Church (US)",
  "Bobov", "Breslov", "Buddhist", "Carlebach", "Catholic", "Chabad",
  "Christian", "Conservative", "Coptic Orthodox", "Eastern Catholic", "Ethiopian (Beta Israel)", "Ethiopian Orthodox",
  "Evangelical", "Ger", "Greek Orthodox", "Hasidic", "Hindu", "Iraqi",
  "Jewish", "Karlin", "Latter-day Saints", "Lutheran", "Mennonite", "Methodist",
  "Missionary Baptist", "Mizrahi", "Modern Orthodox", "Modzitz", "Moravian", "Moroccan",
  "Muslim", "Neo-Hasidic", "Orthodox", "Pagan", "Pentecostal/Charismatic", "Persian",
  "Primitive Baptist", "Protestant", "Quaker", "Rastafari", "Reform", "Reformed/Presbyterian",
  "Renewal", "Rising Song (Hadar)", "Roman Catholic", "Russian Orthodox", "Sephardi", "Sikh",
  "Sufi", "Syrian (Aleppo)", "Unitarian Universalist", "Vizhnitz", "Yemenite",
];
