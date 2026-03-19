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

export interface TrackDetail {
  id: string;
  title: string;
  artists: string[];
  albumName: string | null;
  isrc: string | null;
  artworkUrl: string | null;
  durationMs: number | null;
  releaseDate: string | null;
  isExplicit: boolean;
  previewUrl: string | null;
  sourceService: string | null;
  sourceUrl: string | null;
  shortId: string | null;
  isFeatured: boolean;
  createdAt: number;
  serviceLinks: { service: string; url: string }[];
}

export interface TrackUpdateData {
  title?: string;
  artists?: string[];
  albumName?: string | null;
  isrc?: string | null;
  artworkUrl?: string | null;
}

export interface ListResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export interface AdminRepository {
  countAdmins(): Promise<number>;
  findAdminById(id: string): Promise<AdminUser | null>;
  findAdminByUsername(username: string): Promise<AdminUser | null>;
  createAdminUser(data: { id: string; username: string; passwordHash: string }): Promise<void>;
  updateLastLogin(id: string): Promise<void>;
  listTracks(params: {
    page: number;
    limit: number;
    q?: string;
    sortBy?: string;
    sortDir?: "asc" | "desc";
  }): Promise<ListResult<TrackListItem>>;
  listAlbums(params: {
    page: number;
    limit: number;
    q?: string;
    sortBy?: string;
    sortDir?: "asc" | "desc";
  }): Promise<ListResult<AlbumListItem>>;
  getTrackById(id: string): Promise<TrackDetail | null>;
  updateTrack(id: string, data: TrackUpdateData): Promise<void>;
  deleteTracks(ids: string[]): Promise<void>;
  deleteAlbums(ids: string[]): Promise<void>;
  setTrackFeatured(shortId: string, featured: boolean): Promise<void>;
  setAlbumFeatured(shortId: string, featured: boolean): Promise<void>;
  clearArtistCache(): Promise<{ deleted: number }>;
  countAllData(): Promise<{ tracks: number; albums: number }>;
  resetAllData(): Promise<{ tracks: number; albums: number }>;
}
