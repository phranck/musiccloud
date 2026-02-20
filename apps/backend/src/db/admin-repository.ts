export interface AdminUser {
  id: string;
  username: string;
  passwordHash: string;
  createdAt: number;
  lastLoginAt: number | null;
}

export interface TrackListItem {
  id: string;
  title: string;
  artists: string[];
  albumName: string | null;
  isrc: string | null;
  artworkUrl: string | null;
  sourceService: string | null;
  linkCount: number;
  createdAt: number;
  shortId: string | null;
  isFeatured: boolean;
}

export interface AlbumListItem {
  id: string;
  title: string;
  artists: string[];
  releaseDate: string | null;
  totalTracks: number | null;
  artworkUrl: string | null;
  upc: string | null;
  sourceService: string | null;
  linkCount: number;
  createdAt: number;
  shortId: string | null;
  isFeatured: boolean;
}

export interface ListResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export interface BackfillTrackRow {
  id: string;
  title: string;
  artists: string;
  isrc: string | null;
}

export interface BackfillLinkRow {
  service: string;
  external_id: string | null;
  url: string;
}

export interface AdminRepository {
  countAdmins(): Promise<number>;
  findAdminByUsername(username: string): Promise<AdminUser | null>;
  createAdminUser(data: { id: string; username: string; passwordHash: string }): Promise<void>;
  updateLastLogin(id: string): Promise<void>;
  listTracks(params: { page: number; limit: number; q?: string; sortBy?: string; sortDir?: "asc" | "desc" }): Promise<ListResult<TrackListItem>>;
  listAlbums(params: { page: number; limit: number; q?: string; sortBy?: string; sortDir?: "asc" | "desc" }): Promise<ListResult<AlbumListItem>>;
  deleteTracks(ids: string[]): Promise<void>;
  deleteAlbums(ids: string[]): Promise<void>;
  setTrackFeatured(shortId: string, featured: boolean): Promise<void>;
  setAlbumFeatured(shortId: string, featured: boolean): Promise<void>;
  clearArtistCache(): Promise<{ deleted: number }>;
  countTracksWithMissingPreviewUrl(): Promise<number>;
  getTracksForPreviewBackfill(): Promise<BackfillTrackRow[]>;
  getServiceLinksForBackfill(trackId: string): Promise<BackfillLinkRow[]>;
  updatePreviewUrl(trackId: string, previewUrl: string): Promise<void>;
}
