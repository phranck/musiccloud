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
}

export interface ArtistListItem {
  id: string;
  name: string;
  imageUrl: string | null;
  genres: string[];
  sourceService: string | null;
  linkCount: number;
  createdAt: number;
  shortId: string | null;
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

export interface EmailTemplateRow {
  id: number;
  name: string;
  subject: string;
  headerBannerUrl: string | null;
  headerText: string | null;
  bodyText: string;
  footerBannerUrl: string | null;
  footerText: string | null;
  isSystemTemplate: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface EmailTemplateWriteData {
  name: string;
  subject: string;
  headerBannerUrl?: string | null;
  headerText?: string | null;
  bodyText: string;
  footerBannerUrl?: string | null;
  footerText?: string | null;
  isSystemTemplate?: boolean;
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
  updateAdminUser(
    id: string,
    data: Partial<{
      username: string;
      email: string;
      passwordHash: string;
      firstName: string | null;
      lastName: string | null;
      avatarUrl: string | null;
      locale: string;
      role: string;
      sessionTimeoutMinutes: number | null;
    }>,
  ): Promise<AdminUser | null>;
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
  listArtists(params: {
    page: number;
    limit: number;
    q?: string;
    sortBy?: string;
    sortDir?: "asc" | "desc";
  }): Promise<ListResult<ArtistListItem>>;
  deleteArtists(ids: string[]): Promise<void>;
  getTrackById(id: string): Promise<TrackDetail | null>;
  updateTrack(id: string, data: TrackUpdateData): Promise<void>;
  deleteTracks(ids: string[]): Promise<void>;
  deleteAlbums(ids: string[]): Promise<void>;
  clearArtistCache(): Promise<{ deleted: number }>;
  countAllData(): Promise<{ tracks: number; albums: number; artists: number }>;
  resetAllData(): Promise<{ tracks: number; albums: number; artists: number }>;
  resolveShortIds(shortIds: string[]): Promise<Map<string, { title: string; artist: string }>>;

  /**
   * Mark a single share's resolved data as stale. The share's URL mapping
   * stays intact — only the `updated_at` timestamp on the underlying row is
   * rewound, so the next resolve of the same URL misses the TTL cache and
   * re-fetches fresh data from the source services.
   *
   * Throws if the shortId is unknown.
   */
  invalidateTrackCache(shortId: string): Promise<{ ok: true }>;
  invalidateAlbumCache(shortId: string): Promise<{ ok: true }>;
  invalidateArtistCache(shortId: string): Promise<{ ok: true }>;

  /**
   * Bulk version of the above — stales every track/album/artist row. Shares
   * remain alive; the next access to each triggers a fresh resolve.
   * Returns the number of rows touched per kind.
   */
  invalidateAllCaches(): Promise<{ tracks: number; albums: number; artists: number }>;

  listEmailTemplates(): Promise<EmailTemplateRow[]>;
  getEmailTemplateById(id: number): Promise<EmailTemplateRow | null>;
  getEmailTemplateByName(name: string): Promise<EmailTemplateRow | null>;
  insertEmailTemplate(data: EmailTemplateWriteData): Promise<EmailTemplateRow>;
  updateEmailTemplate(id: number, data: Partial<EmailTemplateWriteData>): Promise<EmailTemplateRow | null>;
  deleteEmailTemplate(id: number): Promise<boolean>;
}
