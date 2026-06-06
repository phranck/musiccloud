export const AdminMusicItemKind = {
  Tracks: "tracks",
  Albums: "albums",
  Artists: "artists",
} as const;

export type AdminMusicItemKind = (typeof AdminMusicItemKind)[keyof typeof AdminMusicItemKind];
