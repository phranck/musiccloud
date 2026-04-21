import type { OverlayWidth, PageDisplayMode, PageTitleAlignment, PageType } from "@musiccloud/shared";

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

// ----------------------------------------------------------------------------
// Content pages (managed in dashboard, rendered by Astro frontend at /:slug)
// ----------------------------------------------------------------------------

export type ContentStatus = "draft" | "published" | "hidden";

export interface ContentPageSummaryRow {
  slug: string;
  title: string;
  status: ContentStatus;
  showTitle: boolean;
  titleAlignment: PageTitleAlignment;
  pageType: PageType;
  displayMode: PageDisplayMode;
  overlayWidth: OverlayWidth;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date | null;
  segments?: { position: number; label: string; targetSlug: string }[];
}

export interface ContentPageRow extends ContentPageSummaryRow {
  content: string;
  contentUpdatedAt: Date;
}

export interface ContentPageTranslationRow {
  slug: string;
  locale: string;
  title: string;
  content: string;
  translationReady: boolean;
  sourceUpdatedAt: Date | null;
  updatedAt: Date;
  updatedBy: string | null;
}

export interface ContentPageTranslationUpsert {
  slug: string;
  locale: string;
  title: string;
  content: string;
  translationReady: boolean;
  sourceUpdatedAt: Date | null;
  updatedBy: string | null;
}

export interface ContentPageCreateData {
  slug: string;
  title: string;
  status?: ContentStatus;
  pageType?: PageType;
  createdBy: string | null;
}

export interface ContentPageMetaUpdate {
  title?: string;
  slug?: string;
  status?: ContentStatus;
  showTitle?: boolean;
  titleAlignment?: PageTitleAlignment;
  pageType?: PageType;
  displayMode?: PageDisplayMode;
  overlayWidth?: OverlayWidth;
  updatedBy: string | null;
}

export interface PageSegmentRow {
  id: number;
  ownerSlug: string;
  targetSlug: string;
  position: number;
  label: string;
  labelUpdatedAt: Date;
}

export interface PageSegmentTranslationRow {
  segmentId: number;
  locale: string;
  label: string;
  sourceUpdatedAt: Date | null;
  updatedAt: Date;
}

export interface PageSegmentInputRow {
  position: number;
  label: string;
  targetSlug: string;
}

// ----------------------------------------------------------------------------
// Navigation items (header / footer link sets, replaced atomically per nav)
// ----------------------------------------------------------------------------

export type NavId = "header" | "footer";
export type NavTarget = "_self" | "_blank";

export interface NavItemRow {
  id: number;
  navId: NavId;
  pageSlug: string | null;
  pageTitle: string | null;
  url: string | null;
  target: NavTarget;
  label: string | null;
  position: number;
  pageType: PageType | null;
  pageDisplayMode: PageDisplayMode | null;
  pageOverlayWidth: OverlayWidth | null;
  labelUpdatedAt: Date;
}

export interface NavItemTranslationRow {
  navItemId: number;
  locale: string;
  label: string;
  sourceUpdatedAt: Date | null;
  updatedAt: Date;
}

export interface NavItemReplaceInput {
  pageSlug?: string | null;
  url?: string | null;
  label?: string | null;
  target?: NavTarget;
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

  /**
   * Returns every admin user that currently has an unexpired invite token.
   * The caller matches the raw token against each `inviteTokenHash` via
   * `bcrypt.compare`, which is why the hash is exposed in this one spot:
   * bcrypt is slow and there is no way to query by hash.
   */
  listPendingInvites(): Promise<
    Array<{
      id: string;
      username: string;
      email: string | null;
      inviteTokenHash: string;
      inviteExpiresAt: Date;
    }>
  >;
  /**
   * Sets the final password and atomically clears the invite columns so
   * the token cannot be replayed. Returns the updated user row.
   */
  acceptInvite(id: string, passwordHash: string): Promise<AdminUser | null>;

  listEmailTemplates(): Promise<EmailTemplateRow[]>;
  getEmailTemplateById(id: number): Promise<EmailTemplateRow | null>;
  getEmailTemplateByName(name: string): Promise<EmailTemplateRow | null>;
  insertEmailTemplate(data: EmailTemplateWriteData): Promise<EmailTemplateRow>;
  updateEmailTemplate(id: number, data: Partial<EmailTemplateWriteData>): Promise<EmailTemplateRow | null>;
  deleteEmailTemplate(id: number): Promise<boolean>;

  // Content pages
  listContentPageSummaries(): Promise<ContentPageSummaryRow[]>;
  getContentPageBySlug(slug: string): Promise<ContentPageRow | null>;
  contentPageSlugExists(slug: string): Promise<boolean>;
  createContentPage(data: ContentPageCreateData): Promise<ContentPageRow>;
  updateContentPageMeta(slug: string, data: ContentPageMetaUpdate): Promise<ContentPageRow | null>;
  updateContentPageBody(slug: string, content: string, updatedBy: string | null): Promise<ContentPageRow | null>;
  deleteContentPage(slug: string): Promise<boolean>;
  /** Resolve admin user IDs to usernames for displaying createdBy / updatedBy. */
  getAdminUsernamesByIds(ids: string[]): Promise<Map<string, string>>;

  // Public reads (no auth) — published pages only
  listPublishedContentPages(): Promise<Array<{ slug: string; title: string }>>;
  getPublishedContentPageBySlug(slug: string): Promise<ContentPageRow | null>;

  // Navigation items
  listAdminNavItems(navId: NavId): Promise<NavItemRow[]>;
  /** Atomically replaces every item for `navId`. Positions are renumbered 0…n. */
  replaceAdminNavItems(navId: NavId, items: NavItemReplaceInput[]): Promise<NavItemRow[]>;

  // Page segments (for content_pages with page_type = 'segmented')
  listSegmentsForOwner(ownerSlug: string): Promise<PageSegmentRow[]>;
  replaceSegmentsForOwner(ownerSlug: string, segments: PageSegmentInputRow[]): Promise<PageSegmentRow[]>;
  deleteSegmentsForOwner(ownerSlug: string): Promise<void>;
  /** Fetch multiple content pages by slug (published + unpublished). Returns rows in input slugs' order is NOT guaranteed. */
  getContentPagesBySlugs(slugs: string[]): Promise<ContentPageRow[]>;
  /** Public variant — published rows only. Used by public API to render segmented pages. */
  getPublishedContentPagesBySlugs(slugs: string[]): Promise<ContentPageRow[]>;

  // Page translations (content_page_translations)
  listPageTranslations(slug: string): Promise<ContentPageTranslationRow[]>;
  getPageTranslation(slug: string, locale: string): Promise<ContentPageTranslationRow | null>;
  upsertPageTranslation(input: ContentPageTranslationUpsert): Promise<ContentPageTranslationRow>;
  deletePageTranslation(slug: string, locale: string): Promise<boolean>;
  /** Bump content_pages.content_updated_at (and updated_at) for a given slug. */
  setContentPageContentUpdatedAt(slug: string, when: Date): Promise<void>;

  // Segment translations (page_segment_translations)
  listSegmentTranslationsForOwner(ownerSlug: string): Promise<PageSegmentTranslationRow[]>;
  replaceSegmentTranslations(
    segmentId: number,
    translations: { locale: string; label: string; sourceUpdatedAt: Date | null }[],
  ): Promise<void>;

  // Nav item translations (nav_item_translations)
  listNavTranslations(navId: NavId): Promise<NavItemTranslationRow[]>;
  replaceNavItemTranslations(
    navItemId: number,
    translations: { locale: string; label: string; sourceUpdatedAt: Date | null }[],
  ): Promise<void>;
}
