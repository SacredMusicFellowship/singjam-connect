// The fixed vocabularies admin AI tools may tag songs with. Genres and themes are
// capped at 3 per song; anything outside these lists is never written.
export const SONG_TONALITIES = [
  "Major", "Minor", "Dorian", "Phrygian", "Lydian", "Mixolydian",
  "Aeolian", "Locrian", "Harmonic Minor", "Melodic Minor",
  "Pentatonic", "Blues", "Whole Tone", "Chromatic", "Modal",
];

export const SONG_METERS = ["4", "3", "5", "7", "9", "11", "Free", "Irregular"];

export const SONG_GENRES = [
  "Afropop", "Alternative Rock", "Americana", "Bluegrass", "Blues", "Bossa Nova",
  "Cajun", "Calypso", "Celtic", "Child Ballad", "Children's Music", "Classic Rock",
  "Contemporary Christian", "Country", "Disco", "Doo-Wop", "Emo", "Flamenco",
  "Folk", "Folk Rock", "Funk", "Gospel", "Grunge", "Hard Rock", "Hip-Hop & Rap",
  "Holiday", "Hymns", "Indie Rock", "Jam Band", "Jazz", "Klezmer", "Latin",
  "Lullaby", "Metal", "Motown", "Musical", "New Wave", "Pop", "Progressive Rock",
  "Psychedelic Rock", "Punk", "R&B", "Reggae", "Rock", "Rockabilly", "Roots Rock",
  "Salsa", "Sea Shanties", "Ska", "Soft Rock", "Soul", "Spiritual", "Zydeco",
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

export const SONG_CULTURES = [
  "American", "Arab", "Argentine", "Australian", "Belgian", "Brazilian", "Cajun", "Cambodian", "Chilean", "Chinese",
  "Colombian", "Creole", "Cuban", "Czech", "Danish", "Dutch", "East African", "Egyptian", "English",
  "Ethiopian", "Filipino", "Finnish", "First Nations/Native American", "French", "German", "Ghanaian", "Greek",
  "Haitian", "Hawaiian", "Hungarian", "Indian", "Indonesian", "Irish", "Israeli", "Italian",
  "Jamaican", "Japanese", "Jewish", "Kenyan", "Korean", "Latin American", "Māori", "Mexican",
  "Nepali", "Nigerian", "Norwegian", "Pakistani", "Peruvian", "Polish",
  "Portuguese", "Puerto Rican", "Romanian", "Romani", "Russian", "Scandinavian", "Scottish",
  "South African", "Spanish", "Sri Lankan", "Swedish", "Swiss", "Tex-Mex", "Thai", "Trinidadian",
  "Turkish", "Ukrainian", "Venezuelan", "Vietnamese", "Welsh", "West African", "Yoruba", "Zulu",
  "Bahá'í", "Buddhist", "Catholic", "Christian", "Confucian", "Eastern Orthodox", "Hindu",
  "Islamic", "Mormon/LDS", "Pagan", "Protestant", "Rastafarian", "Shinto",
  "Sikh", "Sufi", "Taoist", "Zoroastrian",
];
