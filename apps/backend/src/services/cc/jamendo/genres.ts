/**
 * @file The curated Creative-Commons genre set behind the `genre:?` browse grid.
 */

import type { CcGenre } from "./types.js";

/**
 * The curated Creative-Commons genre set surfaced by the `genre:?` browse grid.
 *
 * Jamendo exposes no "top genres" endpoint, and its `/radios` list holds only
 * about 14 editorial stations. This is therefore a hand-curated list of Jamendo
 * genre tags, each verified to return tracks via `tags=<name>`. `name` is the
 * exact lowercase Jamendo tag used for both the genre search and the artwork
 * cover lookup; `displayName` is the human label rendered on the tile and baked
 * into the generated artwork. Ordered roughly by familiarity so the grid reads
 * top-down. `getCcGenres` in `client.ts` serves it.
 */
export const CC_GENRES: CcGenre[] = [
  { name: "rock", displayName: "Rock" },
  { name: "pop", displayName: "Pop" },
  { name: "electro", displayName: "Electronic" },
  { name: "hiphop", displayName: "Hip Hop" },
  { name: "jazz", displayName: "Jazz" },
  { name: "classical", displayName: "Classical" },
  { name: "metal", displayName: "Metal" },
  { name: "folk", displayName: "Folk" },
  { name: "indie", displayName: "Indie" },
  { name: "alternative", displayName: "Alternative" },
  { name: "punk", displayName: "Punk" },
  { name: "grunge", displayName: "Grunge" },
  { name: "postrock", displayName: "Post-Rock" },
  { name: "blues", displayName: "Blues" },
  { name: "reggae", displayName: "Reggae" },
  { name: "ska", displayName: "Ska" },
  { name: "funk", displayName: "Funk" },
  { name: "soul", displayName: "Soul" },
  { name: "rnb", displayName: "R&B" },
  { name: "gospel", displayName: "Gospel" },
  { name: "disco", displayName: "Disco" },
  { name: "house", displayName: "House" },
  { name: "deephouse", displayName: "Deep House" },
  { name: "techno", displayName: "Techno" },
  { name: "trance", displayName: "Trance" },
  { name: "dubstep", displayName: "Dubstep" },
  { name: "drumnbass", displayName: "Drum & Bass" },
  { name: "breakbeat", displayName: "Breakbeat" },
  { name: "edm", displayName: "EDM" },
  { name: "dance", displayName: "Dance" },
  { name: "synthwave", displayName: "Synthwave" },
  { name: "electronica", displayName: "Electronica" },
  { name: "downtempo", displayName: "Downtempo" },
  { name: "chillout", displayName: "Chillout" },
  { name: "ambient", displayName: "Ambient" },
  { name: "lounge", displayName: "Lounge" },
  { name: "newage", displayName: "New Age" },
  { name: "world", displayName: "World" },
  { name: "latin", displayName: "Latin" },
  { name: "country", displayName: "Country" },
  { name: "swing", displayName: "Swing" },
  { name: "experimental", displayName: "Experimental" },
  { name: "psychedelic", displayName: "Psychedelic" },
  { name: "instrumental", displayName: "Instrumental" },
  { name: "acoustic", displayName: "Acoustic" },
  { name: "soundtrack", displayName: "Soundtrack" },
  { name: "cinematic", displayName: "Cinematic" },
  { name: "orchestral", displayName: "Orchestral" },
  { name: "piano", displayName: "Piano" },
];
