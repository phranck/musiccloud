export interface AdminUser {
  id: string;
  username: string;
  passwordHash: string;
  email: string | null;
  role: string;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  locale: string;
  sessionTimeoutMinutes: number | null;
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
  createAdminUser(data: {
    id: string;
    username: string;
    passwordHash: string;
    email?: string;
    role?: string;
    locale?: string;
    inviteTokenHash?: string;
    inviteExpiresAt?: Date;
  }): Promise<void>;
  updateLastLogin(id: string): Promise<void>;
  listAdminUsers(): Promise<AdminUser[]>;
  updateAdminUser(id: string, data: Partial<{
    username: string;
    email: string;
    passwordHash: string;
    firstName: string | null;
    lastName: string | null;
    avatarUrl: string | null;
    locale: string;
    role: string;
    sessionTimeoutMinutes: number | null;
  }>): Promise<AdminUser | null>;
  deleteAdminUser(id: string): Promise<void>;
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
