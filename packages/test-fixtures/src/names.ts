// Invented data only. Places, venues, songs, artists and songwriters are fictional so that
// nothing in a test or screenshot can be mistaken for a real member, event or recording.

export const FIRST_NAMES = [
  "Avery", "Briar", "Calla", "Dorian", "Ember", "Faye", "Gideon", "Harlow", "Indigo", "Jules",
  "Kestrel", "Linden", "Marlowe", "Nico", "Oriel", "Pax", "Quill", "Rowan", "Sable", "Tamsin",
  "Umber", "Vesper", "Wren", "Xavi", "Yarrow", "Zephyr",
] as const;

export const LAST_NAMES = [
  "Ashgrove", "Bellwether", "Cinderford", "Dovecote", "Elmsworth", "Fernhill", "Glenhaven",
  "Hollowmere", "Ivybridge", "Juniperfield", "Kettlewell", "Larkspur", "Meadowlark", "Nettlefold",
  "Oakhurst", "Pennywhistle", "Quarrystone", "Reedbank", "Starling", "Thistledown",
] as const;

export const NEIGHBORHOODS = [
  "Maple Hollow", "Riverbend", "Cedar Flats", "Lantern Hill", "Willow Cove", "Copper Ridge",
  "Fox Glen", "Harbor Point",
] as const;

export const VENUES = [
  { name: "The Lantern Room", address: "41 Lantern Lane, Lantern Hill, CA 90001", neighborhood: "Lantern Hill" },
  { name: "Copper Kettle Hall", address: "7 Kettle Street, Copper Ridge, CA 90002", neighborhood: "Copper Ridge" },
  { name: "Willow Cove Grange", address: "120 Shoreline Road, Willow Cove, CA 90003", neighborhood: "Willow Cove" },
] as const;

export const HOUSE_ADDRESSES = [
  "18 Fern Court, Maple Hollow, CA 90004",
  "302 Orchard Way, Riverbend, CA 90005",
  "9 Starling Place, Fox Glen, CA 90006",
] as const;

export const INSTRUMENTS = [
  "Guitar", "Piano/Keys", "Electric Bass", "Upright Bass", "Drums", "Percussion",
  "Violin/Fiddle", "Cello", "Ukulele", "Mandolin", "Banjo", "Harmonica", "Saxophone",
] as const;

export const INSTRUMENT_LEVELS = ["Beginner", "Intermediate", "Advanced", "Professional"] as const;

export const SINGING_VOICES = [["lead"], ["backup"], ["lead", "backup"], ["none"]] as const;

// Must exist in public.genres, which the migrations seed.
export const GENRES = [
  "Folk", "Americana", "Bluegrass", "Blues", "Country", "Gospel", "Jazz", "Motown", "Pop",
  "R&B", "Reggae", "Rock", "Soul", "Singer-Songwriter", "Shanties", "Celtic",
] as const;

export const ARTISTS = [
  "The Paper Moons", "Juniper & the Jackdaws", "Marigold Station", "The Lowland Lanterns",
  "Ola Featherstone", "The Brass Orchard", "Cass Underhill", "Velvet Ferryman",
  "The Harbor Choir", "Moss & Mica", "Delphine Arrowood", "The Night Owls of Fox Glen",
] as const;

export const SONGWRITERS = [
  "Ada Brightwater", "Basil Thornecroft", "Celeste Windham", "Desmond Larkby", "Eloise Fairweather",
  "Felix Ambersmith", "Greta Hollis", "Hugo Marchbank", "Iris Pemberley", "Jasper Quaid",
] as const;

// Titles and first lines are written for these fixtures.
export const SONGS = [
  { title: "Lanterns Over the Harbor", firstLine: "We lit the lamps along the water", genre: "Folk", vibe: "Ballad" },
  { title: "Paper Boats", firstLine: "Fold it twice and let it go", genre: "Singer-Songwriter", vibe: "Ballad" },
  { title: "Copper Ridge Rambler", firstLine: "Up the switchback, boots and banjo", genre: "Bluegrass", vibe: "Banger" },
  { title: "Saturday at the Grange", firstLine: "Push the chairs against the wall", genre: "Country", vibe: "Banger" },
  { title: "Moonlight on the Mill Pond", firstLine: "Still water, silver sky", genre: "Americana", vibe: "Ballad" },
  { title: "Raise the Rafters", firstLine: "Everybody sing it louder now", genre: "Gospel", vibe: "Banger" },
  { title: "Blue Kettle Blues", firstLine: "The kettle's cold and so am I", genre: "Blues", vibe: "Ballad" },
  { title: "Dancing in the Orchard", firstLine: "Apples falling, fiddles calling", genre: "Celtic", vibe: "Banger" },
  { title: "Keep the Light On", firstLine: "If you're out there on the road tonight", genre: "Soul", vibe: "Ballad" },
  { title: "Ferryman's Shanty", firstLine: "Haul away, the tide is turning", genre: "Shanties", vibe: "Banger" },
  { title: "Velvet Avenue", firstLine: "Neon hums on Velvet Avenue", genre: "Motown", vibe: "Banger" },
  { title: "Slow Train to Riverbend", firstLine: "Count the fence posts one by one", genre: "Americana", vibe: "Ballad" },
  { title: "Golden Hour Groove", firstLine: "Sun's low, let it roll", genre: "R&B", vibe: "Banger" },
  { title: "Under the Willow", firstLine: "Meet me where the branches bend", genre: "Folk", vibe: "Ballad" },
  { title: "Rooftop Reggae", firstLine: "Sweet breeze on the rooftop", genre: "Reggae", vibe: "Banger" },
  { title: "Heartstrings and Harmonies", firstLine: "Three voices and a tune", genre: "Pop", vibe: "Ballad" },
  { title: "Thunder on the Ridge", firstLine: "Hear it rolling down the valley", genre: "Rock", vibe: "Banger" },
  { title: "Smoke Rings", firstLine: "Late set, low lights", genre: "Jazz", vibe: "Ballad" },
  { title: "Home by the Harbor Light", firstLine: "Leave the porch light burning", genre: "Folk", vibe: "Ballad" },
  { title: "Wildflower Waltz", firstLine: "One two three across the meadow", genre: "Country", vibe: "Ballad" },
  { title: "Fox Glen Fiddle Tune", firstLine: "Bow the strings and stamp your feet", genre: "Bluegrass", vibe: "Banger" },
  { title: "Echoes in the Canyon", firstLine: "Call my name and hear it back", genre: "Rock", vibe: "Ballad" },
  { title: "Sweet Morning Glory", firstLine: "Wake up, wake up, the day is new", genre: "Gospel", vibe: "Ballad" },
  { title: "Midnight Ferry", firstLine: "Last boat leaves at twelve", genre: "Blues", vibe: "Ballad" },
  { title: "Kitchen Table Chorus", firstLine: "Pass the bread and pass the tune", genre: "Folk", vibe: "Banger" },
  { title: "Starlight Serenade", firstLine: "Every star's a note tonight", genre: "Jazz", vibe: "Ballad" },
  { title: "Down by the Copper Creek", firstLine: "Water's high and moving fast", genre: "Americana", vibe: "Banger" },
  { title: "Brighter Days Ahead", firstLine: "Hold on, the clouds are breaking", genre: "Soul", vibe: "Banger" },
  { title: "The Lighthouse Keeper", firstLine: "Forty years of watching waves", genre: "Celtic", vibe: "Ballad" },
  { title: "Sunday Best", firstLine: "Shine your shoes and comb your hair", genre: "Motown", vibe: "Banger" },
  { title: "Rain on the Tin Roof", firstLine: "Pitter patter, let it come", genre: "Country", vibe: "Ballad" },
  { title: "Tidewater", firstLine: "In and out the tide goes", genre: "Singer-Songwriter", vibe: "Ballad" },
  { title: "Party at the Lantern Room", firstLine: "Doors open, come on in", genre: "Pop", vibe: "Banger" },
  { title: "Old Bridge Road", firstLine: "Gravel crunching under wheels", genre: "Americana", vibe: "Ballad" },
  { title: "Hearthside", firstLine: "Pull a chair up to the fire", genre: "Folk", vibe: "Ballad" },
  { title: "Juke Joint Jubilee", firstLine: "Piano's out of tune but who cares", genre: "Blues", vibe: "Banger" },
  { title: "Harvest Moon Hoedown", firstLine: "Swing your partner round and round", genre: "Bluegrass", vibe: "Banger" },
  { title: "Glass Half Full", firstLine: "Pour another, it's all good", genre: "R&B", vibe: "Ballad" },
  { title: "Island Morning", firstLine: "Coffee and the sound of waves", genre: "Reggae", vibe: "Ballad" },
  { title: "We Sing Together", firstLine: "No one's voice is wrong in here", genre: "Gospel", vibe: "Banger" },
] as const;

export const METERS = ["4/4", "3/4", "6/8"] as const;
