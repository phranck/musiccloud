import type {
  ContentCardStyle,
  ContentContextMask,
  ContentPublication,
  EmailBlock,
  NavigationAreaMask,
  NavigationEntryInput,
  NavigationPlacement,
  NavigationSystemKey,
  NavigationTargetKind,
  OverlayWidth,
  PageDisplayMode,
  PageTitleAlignment,
  PageType,
  SingleContentContext,
} from "@musiccloud/shared";
import type { ArtistCredit } from "../services/types.js";

/** Admin user data shape returned or accepted by the database repository layer. */
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

/** Track list item shape returned or accepted by the database repository layer. */
export interface TrackListItem {
  id: string;
  title: string;
  artists: string[];
  artistCredits: ArtistCredit[];
  albumName: string | null;
  isrc: string | null;
  artworkUrl: string | null;
  sourceService: string | null;
  linkCount: number;
  createdAt: number;
  shortId: string | null;
}

/** Album list item shape returned or accepted by the database repository layer. */
export interface AlbumListItem {
  id: string;
  title: string;
  artists: string[];
  artistCredits: ArtistCredit[];
  releaseDate: string | null;
  totalTracks: number | null;
  artworkUrl: string | null;
  upc: string | null;
  sourceService: string | null;
  linkCount: number;
  createdAt: number;
  shortId: string | null;
}

/** Artist list item shape returned or accepted by the database repository layer. */
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

/** Artist entity list item shape returned or accepted by the database repository layer. */
export interface ArtistEntityListItem {
  id: string;
  name: string;
  entityType: string;
  verificationStatus: string;
  trackCreditCount: number;
  albumCreditCount: number;
  hasProfile: boolean;
  shortId: string | null;
  createdAt: number;
}

/** Track detail data shape returned or accepted by the database repository layer. */
export interface TrackDetail {
  id: string;
  title: string;
  artists: string[];
  artistCredits: ArtistCredit[];
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

/** Track update payload shape returned or accepted by the database repository layer. */
export interface TrackUpdateData {
  title?: string;
  artists?: string[];
  artistCredits?: ArtistCredit[];
  albumName?: string | null;
  isrc?: string | null;
  artworkUrl?: string | null;
}

/** List result shape returned or accepted by the database repository layer. */
export interface ListResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

/**
 * Branding fields a single email template may override (MC-079). Every field
 * is REQUIRED here (always present on a read), and the value `null` carries
 * meaning: "no override for this field — fall back to the global
 * {@link EmailBrandingDto} default at render time". This is the shape read
 * fully out of the DB, mirroring {@link EmailBrandingDto}.
 *
 * For partial updates (present-keys-only semantics, matching
 * `updateEmailBranding`) this type is wrapped in `Partial<>` rather than being
 * declared double-optional: an ABSENT key leaves the stored override
 * untouched, a key present as `null` clears the override, and a non-null value
 * sets it.
 */
export interface EmailTemplateBrandingOverrides {
  headerAssetId: string | null;
  footerText: string | null;
  lightBackgroundAssetId: string | null;
  darkBackgroundAssetId: string | null;
  lightGradientTop: string | null;
  lightGradientBottom: string | null;
  darkGradientTop: string | null;
  darkGradientBottom: string | null;
}

/** Email template row shape returned or accepted by the database repository layer. */
export interface EmailTemplateRow {
  id: number;
  name: string;
  subject: string;
  blocks: EmailBlock[];
  isSystemTemplate: boolean;
  createdAt: Date;
  updatedAt: Date;
  /** Per-template branding overrides; each `null` field inherits the global default. */
  branding: EmailTemplateBrandingOverrides;
}

/** Email template write payload shape returned or accepted by the database repository layer. */
export interface EmailTemplateWriteData {
  name: string;
  subject: string;
  blocks: EmailBlock[];
  isSystemTemplate?: boolean;
  /** Present-keys-only branding overrides (like `updateEmailBranding`): absent key = unchanged, `null` = clear override. */
  branding?: Partial<EmailTemplateBrandingOverrides>;
}

/**
 * Global branding singleton — the per-render default (MC-078), now including
 * the day/night page background (MC-079). Header/footer asset ids, footer
 * text and the two background-image asset ids are nullable; the four gradient
 * colours are always set (NOT NULL in the DB with the website night-sky
 * shader defaults), so a gradient can always render.
 */
export interface EmailBrandingDto {
  headerAssetId: string | null;
  footerText: string | null;
  lightBackgroundAssetId: string | null;
  darkBackgroundAssetId: string | null;
  lightGradientTop: string;
  lightGradientBottom: string;
  darkGradientTop: string;
  darkGradientBottom: string;
}

/** An issued email image asset (metadata; bytes fetched separately via a dedicated streaming route). */
export interface EmailAssetDto {
  id: string;
  mimeType: string;
  createdAt: Date;
}

/** A binding of a code-defined system action key to a template. */
export interface EmailActionBindingDto {
  id: string;
  actionKey: string;
  templateId: number;
  enabled: boolean;
}

// ----------------------------------------------------------------------------
// Content pages (managed in dashboard, rendered by Astro frontend at /:slug)
// ----------------------------------------------------------------------------

/** Content status union used by the database repository layer. */
export type ContentStatus = "draft" | "published" | "hidden";

/** Content page summary row shape returned or accepted by the database repository layer. */
export interface ContentPageSummaryRow {
  id?: string;
  slug: string;
  contextMask?: ContentContextMask;
  publications?: ContentPublicationRow[];
  title: string;
  status: ContentStatus;
  showTitle: boolean;
  titleAlignment: PageTitleAlignment;
  pageType: PageType;
  displayMode: PageDisplayMode;
  overlayWidth: OverlayWidth;
  contentCardStyle: ContentCardStyle;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date | null;
  segments?: { position: number; label: string; targetSlug: string }[];
}

/** Content page row shape returned or accepted by the database repository layer. */
export interface ContentPageRow extends ContentPageSummaryRow {
  content: string;
  contentUpdatedAt: Date;
}

/** Content page translation row shape returned or accepted by the database repository layer. */
export interface ContentPageTranslationRow {
  slug: string;
  locale: string;
  title: string;
  content: string;
  sourceUpdatedAt: Date | null;
  updatedAt: Date;
  updatedBy: string | null;
}

/** Content page translation upsert data shape returned or accepted by the database repository layer. */
export interface ContentPageTranslationUpsert {
  slug: string;
  locale: string;
  title: string;
  content: string;
  sourceUpdatedAt: Date | null;
  updatedBy: string | null;
}

/** Content page create payload shape returned or accepted by the database repository layer. */
export interface ContentPageCreateData {
  slug: string;
  title: string;
  contextMask?: ContentContextMask;
  publications?: ContentPublication[];
  status?: ContentStatus;
  pageType?: PageType;
  createdBy: string | null;
}

/** Content page meta update data shape returned or accepted by the database repository layer. */
export interface ContentPageMetaUpdate {
  contextMask?: ContentContextMask;
  publications?: ContentPublication[];
  title?: string;
  slug?: string;
  status?: ContentStatus;
  showTitle?: boolean;
  titleAlignment?: PageTitleAlignment;
  pageType?: PageType;
  displayMode?: PageDisplayMode;
  overlayWidth?: OverlayWidth;
  contentCardStyle?: ContentCardStyle;
  updatedBy: string | null;
}

/** Persisted context-specific publication row. */
export interface ContentPublicationRow {
  pageId: string;
  context: SingleContentContext;
  path: string;
  status: ContentStatus;
  templateKey: string;
}

/** Canonical Page fields used only when the Terms identity is absent at cutover preflight. */
export interface ContentPublicationCutoverPageCreate {
  title: string;
  content: string;
  contextMask: ContentContextMask;
  status: ContentStatus;
  showTitle: boolean;
  titleAlignment: PageTitleAlignment;
  pageType: PageType;
  displayMode: PageDisplayMode;
  overlayWidth: OverlayWidth;
  contentCardStyle: ContentCardStyle;
}

/** One expected existing Page or one Page whose continued absence authorizes creation. */
export interface ContentPublicationCutoverInput {
  sourceSlug: string;
  expectedPage:
    | { kind: "existing"; pageId: string; fingerprint: string }
    | { kind: "absent"; fingerprint: string; create: ContentPublicationCutoverPageCreate };
  publications: ContentPublication[];
}

/** Writes committed by one atomic Page/publication cutover transaction. */
export interface ContentPublicationCutoverResult {
  createdPages: Array<{ sourceSlug: string; pageId: string; fingerprint: string }>;
  publications: ContentPublicationRow[];
}

/** Page segment row shape returned or accepted by the database repository layer. */
export interface PageSegmentRow {
  id: number;
  ownerSlug: string;
  targetSlug: string;
  position: number;
  label: string;
  labelUpdatedAt: Date;
}

/** Page segment translation row shape returned or accepted by the database repository layer. */
export interface PageSegmentTranslationRow {
  segmentId: number;
  locale: string;
  label: string;
  sourceUpdatedAt: Date | null;
  updatedAt: Date;
}

/** Page segment input row shape returned or accepted by the database repository layer. */
export interface PageSegmentInputRow {
  position: number;
  label: string;
  targetSlug: string;
  translations?: Partial<Record<string, string>>;
}

/** Bulk update pages payload data shape returned or accepted by the database repository layer. */
export interface BulkUpdatePagesPayload {
  pages: Array<{ slug: string; meta?: ContentPageMetaUpdate; content?: string }>;
  segments: Array<{ ownerSlug: string; segments: PageSegmentInputRow[] }>;
  pageTranslations: Array<{
    slug: string;
    locale: string;
    title?: string;
    content?: string;
    updatedBy?: string | null;
  }>;
  topLevelOrder: string[];
}

// ----------------------------------------------------------------------------
// Navigation items (header / footer link sets, replaced atomically per nav)
// ----------------------------------------------------------------------------

/** Nav ID union used by the database repository layer. */
export type NavId = "header" | "footer";
/** Nav target union used by the database repository layer. */
export type NavTarget = "_self" | "_blank";

/** Nav item row shape returned or accepted by the database repository layer. */
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

/** Nav item translation row shape returned or accepted by the database repository layer. */
export interface NavItemTranslationRow {
  navItemId: number;
  locale: string;
  label: string;
  sourceUpdatedAt: Date | null;
  updatedAt: Date;
}

/** Nav item replace input data shape returned or accepted by the database repository layer. */
export interface NavItemReplaceInput {
  pageSlug?: string | null;
  url?: string | null;
  label?: string | null;
  target?: NavTarget;
}

/** Contextual navigation row returned by the atomic configuration repository. */
export interface NavigationConfigurationEntryRow extends NavigationEntryInput {
  id: number;
  pageSlug: string | null;
  pageTitle: string | null;
  labelUpdatedAt: Date;
  placements: NavigationPlacement[];
}

/** Fully validated contextual navigation entry accepted by persistence. */
export interface NavigationConfigurationReplaceInput {
  targetKind: NavigationTargetKind;
  pageId: string | null;
  url: string | null;
  systemKey: NavigationSystemKey | null;
  target: NavTarget;
  label: string | null;
  contextMask: ContentContextMask;
  areaMask: NavigationAreaMask;
  placements: NavigationPlacement[];
  translations?: Partial<Record<string, string>>;
}

/**
 * Admin-facing repository contract for dashboard CRUD, content management,
 * navigation, email templates, cache invalidation and invite flows.
 *
 * Implementations are responsible for translating dashboard filters and write
 * payloads into persistent rows without exposing SQL to route handlers.
 */
export interface AdminRepository {
  /**
   * Counts admins.
   *
   * @returns The numeric result of the query or mutation.
   */
  countAdmins(): Promise<number>;
  /**
   * Finds admin by ID.
   *
   * @param id - The `id` value.
   * @returns The matching record, or `null` when no row matches.
   */
  findAdminById(id: string): Promise<AdminUser | null>;
  /**
   * Finds admin by username.
   *
   * @param username - The `username` value.
   * @returns The matching record, or `null` when no row matches.
   */
  findAdminByUsername(username: string): Promise<AdminUser | null>;
  /**
   * Creates admin user.
   *
   * @param data - The `data` value.
   * @returns A promise that resolves when the operation completes.
   */
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
  /**
   * Updates last login.
   *
   * @param id - The `id` value.
   * @returns A promise that resolves when the operation completes.
   */
  updateLastLogin(id: string): Promise<void>;
  /**
   * Lists admin users.
   *
   * @returns The matching rows.
   */
  listAdminUsers(): Promise<AdminUser[]>;
  /**
   * Updates admin user.
   *
   * @param id - The `id` value.
   * @param data - The `data` value.
   * @returns The matching record, or `null` when no row matches.
   */
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
  /**
   * Deletes admin user.
   *
   * @param id - The `id` value.
   * @returns A promise that resolves when the operation completes.
   */
  deleteAdminUser(id: string): Promise<void>;
  /**
   * Lists tracks.
   *
   * @param params - The `params` value.
   * @returns The requested repository result.
   */
  listTracks(params: {
    page: number;
    limit: number;
    q?: string;
    sortBy?: string;
    sortDir?: "asc" | "desc";
  }): Promise<ListResult<TrackListItem>>;
  /**
   * Lists albums.
   *
   * @param params - The `params` value.
   * @returns The requested repository result.
   */
  listAlbums(params: {
    page: number;
    limit: number;
    q?: string;
    sortBy?: string;
    sortDir?: "asc" | "desc";
  }): Promise<ListResult<AlbumListItem>>;
  /**
   * Lists artists.
   *
   * @param params - The `params` value.
   * @returns The requested repository result.
   */
  listArtists(params: {
    page: number;
    limit: number;
    q?: string;
    sortBy?: string;
    sortDir?: "asc" | "desc";
  }): Promise<ListResult<ArtistListItem>>;
  /**
   * Lists artist entities.
   *
   * @param params - The `params` value.
   * @returns The requested repository result.
   */
  listArtistEntities(params: {
    page: number;
    limit: number;
    q?: string;
    sortBy?: string;
    sortDir?: "asc" | "desc";
  }): Promise<ListResult<ArtistEntityListItem>>;
  /**
   * Deletes artists.
   *
   * @param ids - The `ids` value.
   * @returns A promise that resolves when the operation completes.
   */
  deleteArtists(ids: string[]): Promise<void>;
  /**
   * Gets track by ID.
   *
   * @param id - The `id` value.
   * @returns The matching record, or `null` when no row matches.
   */
  getTrackById(id: string): Promise<TrackDetail | null>;
  /**
   * Updates track.
   *
   * @param id - The `id` value.
   * @param data - The `data` value.
   * @returns A promise that resolves when the operation completes.
   */
  updateTrack(id: string, data: TrackUpdateData): Promise<void>;
  /**
   * Deletes tracks.
   *
   * @param ids - The `ids` value.
   * @returns A promise that resolves when the operation completes.
   */
  deleteTracks(ids: string[]): Promise<void>;
  /**
   * Deletes albums.
   *
   * @param ids - The `ids` value.
   * @returns A promise that resolves when the operation completes.
   */
  deleteAlbums(ids: string[]): Promise<void>;
  /**
   * Clears artist cache.
   *
   * @returns The requested repository result.
   */
  clearArtistCache(): Promise<{ deleted: number }>;
  /**
   * Counts all data.
   *
   * @returns The requested repository result.
   */
  countAllData(): Promise<{
    tracks: number;
    albums: number;
    artists: number;
    artistProfiles: number;
    artistEntities: number;
  }>;
  /**
   * Resets all data.
   *
   * @returns The requested repository result.
   */
  resetAllData(): Promise<{ tracks: number; albums: number; artists: number }>;
  /**
   * Resolves short IDs.
   *
   * @param shortIds - The `shortIds` value.
   * @returns A map keyed by the requested identifiers.
   */
  resolveShortIds(shortIds: string[]): Promise<Map<string, { title: string; artist: string }>>;

  /**
   * Mark an artist share's resolved data as stale. The share's URL mapping
   * stays intact — only the `updated_at` timestamp on the underlying
   * `artist_profiles` row is rewound, so the next resolve of the same URL
   * misses the 48h TTL cache and re-fetches fresh data from the source
   * services.
   *
   * Tracks and albums have no equivalent: their resolves no longer gate on
   * `updated_at`, so rewinding it would have no effect.
   *
   * @param shortId - The artist share's short id.
   * @returns `{ ok: true }` on success.
   * @throws If the shortId is unknown.
   */
  invalidateArtistCache(shortId: string): Promise<{ ok: true }>;

  /**
   * Bulk version of the above — stales every track/album/artist row. Shares
   * remain alive; the next access to each triggers a fresh resolve.
   * Returns the number of rows touched per kind.
   */
  /**
   * Invalidates all caches.
   *
   * @returns The requested repository result.
   */
  invalidateAllCaches(): Promise<{ tracks: number; albums: number; artists: number }>;

  /**
   * Returns every admin user that currently has an unexpired invite token.
   * The caller matches the raw token against each `inviteTokenHash` via
   * `bcrypt.compare`, which is why the hash is exposed in this one spot:
   * bcrypt is slow and there is no way to query by hash.
   */
  /**
   * Lists pending invites.
   *
   * @returns The matching rows.
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
  /**
   * Accepts invite.
   *
   * @param id - The `id` value.
   * @param passwordHash - The `passwordHash` value.
   * @returns The matching record, or `null` when no row matches.
   */
  acceptInvite(id: string, passwordHash: string): Promise<AdminUser | null>;

  /**
   * Lists email templates.
   *
   * @returns The matching rows.
   */
  listEmailTemplates(): Promise<EmailTemplateRow[]>;
  /**
   * Gets email template by ID.
   *
   * @param id - The `id` value.
   * @returns The matching record, or `null` when no row matches.
   */
  getEmailTemplateById(id: number): Promise<EmailTemplateRow | null>;
  /**
   * Gets email template by name.
   *
   * @param name - The `name` value.
   * @returns The matching record, or `null` when no row matches.
   */
  getEmailTemplateByName(name: string): Promise<EmailTemplateRow | null>;
  /**
   * Inserts email template.
   *
   * @param data - The `data` value.
   * @returns The requested repository result.
   */
  insertEmailTemplate(data: EmailTemplateWriteData): Promise<EmailTemplateRow>;
  /**
   * Updates email template.
   *
   * @param id - The `id` value.
   * @param data - The `data` value.
   * @returns The matching record, or `null` when no row matches.
   */
  updateEmailTemplate(id: number, data: Partial<EmailTemplateWriteData>): Promise<EmailTemplateRow | null>;
  /**
   * Deletes email template.
   *
   * @param id - The `id` value.
   * @returns Whether the requested row exists or mutation succeeded.
   */
  deleteEmailTemplate(id: number): Promise<boolean>;

  /**
   * Gets the global email branding singleton (header/footer asset + footer text).
   *
   * @returns The branding row.
   */
  getEmailBranding(): Promise<EmailBrandingDto>;
  /**
   * Partially updates the global email branding singleton.
   *
   * @param data - Subset of mutable branding fields.
   * @returns The updated branding row.
   */
  updateEmailBranding(data: Partial<EmailBrandingDto>): Promise<EmailBrandingDto>;
  /**
   * Lists every email image asset's metadata (id, MIME type, created-at),
   * newest first — bytes are not included. Backs the dashboard's shared-asset
   * picker so a previously uploaded image can be reused without re-uploading.
   *
   * @returns All email asset metadata rows, newest first.
   */
  listEmailAssets(): Promise<EmailAssetDto[]>;
  /**
   * Inserts a new email image asset.
   *
   * @param data - The asset's MIME type and raw bytes.
   * @returns The persisted asset's metadata (bytes are not returned).
   */
  insertEmailAsset(data: { mimeType: string; bytes: Buffer }): Promise<EmailAssetDto>;
  /**
   * Gets an email asset's raw bytes for streaming.
   *
   * @param id - The asset's id.
   * @returns The MIME type and bytes, or `null` when no row matches.
   */
  getEmailAssetBytes(id: string): Promise<{ mimeType: string; bytes: Buffer } | null>;
  /**
   * Lists email action bindings, optionally filtered by action key.
   *
   * @param actionKey - When given, restricts results to this action.
   * @returns The matching bindings.
   */
  listEmailActionBindings(actionKey?: string): Promise<EmailActionBindingDto[]>;
  /**
   * Creates (or re-enables) a binding of an action key to a template.
   *
   * @param data - The action key and template id to bind.
   * @returns The persisted binding.
   */
  createEmailActionBinding(data: { actionKey: string; templateId: number }): Promise<EmailActionBindingDto>;
  /**
   * Enables or disables an existing action binding.
   *
   * @param id - The binding's id.
   * @param enabled - The new enabled state.
   * @returns The updated binding, or `null` when no row matches.
   */
  setEmailActionBindingEnabled(id: string, enabled: boolean): Promise<EmailActionBindingDto | null>;
  /**
   * Deletes an action binding.
   *
   * @param id - The binding's id.
   * @returns Whether the requested row exists or mutation succeeded.
   */
  deleteEmailActionBinding(id: string): Promise<boolean>;

  // Content pages
  /**
   * Lists content page summaries.
   *
   * @returns The matching rows.
   */
  listContentPageSummaries(): Promise<ContentPageSummaryRow[]>;
  /**
   * Gets content page by slug.
   *
   * @param slug - The `slug` value.
   * @returns The matching record, or `null` when no row matches.
   */
  getContentPageBySlug(slug: string): Promise<ContentPageRow | null>;
  /** Gets a content page by its stable identity. */
  getContentPageById(id: string): Promise<ContentPageRow | null>;
  /**
   * Handles content page slug exists.
   *
   * @param slug - The `slug` value.
   * @returns Whether the requested row exists or mutation succeeded.
   */
  contentPageSlugExists(slug: string): Promise<boolean>;
  /**
   * Creates content page.
   *
   * @param data - The `data` value.
   * @returns The requested repository result.
   */
  createContentPage(data: ContentPageCreateData): Promise<ContentPageRow>;
  /**
   * Updates content page meta.
   *
   * @param slug - The `slug` value.
   * @param data - The `data` value.
   * @returns The matching record, or `null` when no row matches.
   */
  updateContentPageMeta(slug: string, data: ContentPageMetaUpdate): Promise<ContentPageRow | null>;
  /**
   * Updates content page body.
   *
   * @param slug - The `slug` value.
   * @param content - The `content` value.
   * @param updatedBy - The `updatedBy` value.
   * @returns The matching record, or `null` when no row matches.
   */
  updateContentPageBody(slug: string, content: string, updatedBy: string | null): Promise<ContentPageRow | null>;
  /**
   * Deletes content page.
   *
   * @param slug - The `slug` value.
   * @returns Whether the requested row exists or mutation succeeded.
   */
  deleteContentPage(slug: string): Promise<boolean>;
  /** Resolve admin user IDs to usernames for displaying createdBy / updatedBy. */
  /**
   * Gets admin usernames by IDs.
   *
   * @param ids - The `ids` value.
   * @returns A map keyed by the requested identifiers.
   */
  getAdminUsernamesByIds(ids: string[]): Promise<Map<string, string>>;

  // Public reads (no auth) — published pages only
  /**
   * Lists published content pages.
   *
   * @returns The matching rows.
   */
  listPublishedContentPages(): Promise<Array<{ slug: string; title: string }>>;
  /**
   * Gets published content page by slug.
   *
   * @param slug - The `slug` value.
   * @returns The matching record, or `null` when no row matches.
   */
  getPublishedContentPageBySlug(slug: string): Promise<ContentPageRow | null>;
  /** Lists every context publication assigned to a stable page identity. */
  listContentPublications(pageId: string): Promise<ContentPublicationRow[]>;
  /** Resolves one published page by canonical path inside a content context. */
  getPublishedContentPageByPath(context: SingleContentContext, path: string): Promise<ContentPageRow | null>;
  /** Atomically replaces the context publications assigned to a page. */
  replaceContentPublications(pageId: string, publications: ContentPublication[]): Promise<ContentPublicationRow[]>;
  /**
   * Atomically revalidates and inserts a closed set of missing contextual publications.
   * Existing publication rows are never replaced or deleted; exact targets are no-ops.
   *
   * @returns Only the Page identities and publication rows inserted by this transaction.
   */
  applyContentPublicationCutover(entries: ContentPublicationCutoverInput[]): Promise<ContentPublicationCutoverResult>;

  // Navigation items
  /**
   * Lists admin nav items.
   *
   * @param navId - The `navId` value.
   * @returns The matching rows.
   */
  listAdminNavItems(navId: NavId): Promise<NavItemRow[]>;
  /** Atomically replaces every item for `navId`. Positions are renumbered 0…n. */
  /**
   * Replaces admin nav items.
   *
   * @param navId - The `navId` value.
   * @param items - The `items` value.
   * @returns The matching rows.
   */
  replaceAdminNavItems(navId: NavId, items: NavItemReplaceInput[]): Promise<NavItemRow[]>;
  /** Lists the complete contextual navigation configuration. */
  listNavigationConfiguration(): Promise<NavigationConfigurationEntryRow[]>;
  /** Atomically replaces entries, placements, and label translations. */
  replaceNavigationConfiguration(
    entries: NavigationConfigurationReplaceInput[],
  ): Promise<NavigationConfigurationEntryRow[]>;

  // Page segments (for content_pages with page_type = 'segmented')
  /**
   * Lists segments for owner.
   *
   * @param ownerSlug - The `ownerSlug` value.
   * @returns The matching rows.
   */
  listSegmentsForOwner(ownerSlug: string): Promise<PageSegmentRow[]>;
  /**
   * Replaces segments for owner.
   *
   * @param ownerSlug - The `ownerSlug` value.
   * @param segments - The `segments` value.
   * @returns The matching rows.
   */
  replaceSegmentsForOwner(ownerSlug: string, segments: PageSegmentInputRow[]): Promise<PageSegmentRow[]>;
  /**
   * Handles bulk update pages.
   *
   * @param payload - The `payload` value.
   * @returns The matching rows.
   */
  bulkUpdatePages(payload: BulkUpdatePagesPayload): Promise<ContentPageSummaryRow[]>;
  /**
   * Deletes segments for owner.
   *
   * @param ownerSlug - The `ownerSlug` value.
   * @returns A promise that resolves when the operation completes.
   */
  deleteSegmentsForOwner(ownerSlug: string): Promise<void>;
  /** Fetch multiple content pages by slug (published + unpublished). Returns rows in input slugs' order is NOT guaranteed. */
  /**
   * Gets content pages by slugs.
   *
   * @param slugs - The `slugs` value.
   * @returns The matching rows.
   */
  getContentPagesBySlugs(slugs: string[]): Promise<ContentPageRow[]>;
  /** Public variant — published rows only. Used by public API to render segmented pages. */
  /**
   * Gets published content pages by slugs.
   *
   * @param slugs - The `slugs` value.
   * @returns The matching rows.
   */
  getPublishedContentPagesBySlugs(slugs: string[]): Promise<ContentPageRow[]>;

  // Page translations (content_page_translations)
  /**
   * Lists page translations.
   *
   * @param slug - The `slug` value.
   * @returns The matching rows.
   */
  listPageTranslations(slug: string): Promise<ContentPageTranslationRow[]>;
  /**
   * Gets page translation.
   *
   * @param slug - The `slug` value.
   * @param locale - The `locale` value.
   * @returns The matching record, or `null` when no row matches.
   */
  getPageTranslation(slug: string, locale: string): Promise<ContentPageTranslationRow | null>;
  /**
   * Upserts page translation.
   *
   * @param input - The `input` value.
   * @returns The requested repository result.
   */
  upsertPageTranslation(input: ContentPageTranslationUpsert): Promise<ContentPageTranslationRow>;
  /**
   * Deletes page translation.
   *
   * @param slug - The `slug` value.
   * @param locale - The `locale` value.
   * @returns Whether the requested row exists or mutation succeeded.
   */
  deletePageTranslation(slug: string, locale: string): Promise<boolean>;
  /** Bump content_pages.content_updated_at (and updated_at) for a given slug. */
  /**
   * Sets content page content updated at.
   *
   * @param slug - The `slug` value.
   * @param when - The `when` value.
   * @returns A promise that resolves when the operation completes.
   */
  setContentPageContentUpdatedAt(slug: string, when: Date): Promise<void>;

  // Segment translations (page_segment_translations)
  /**
   * Lists segment translations for owner.
   *
   * @param ownerSlug - The `ownerSlug` value.
   * @returns The matching rows.
   */
  listSegmentTranslationsForOwner(ownerSlug: string): Promise<PageSegmentTranslationRow[]>;
  /**
   * Replaces segment translations.
   *
   * @param segmentId - The `segmentId` value.
   * @param translations - The `translations` value.
   * @returns A promise that resolves when the operation completes.
   */
  replaceSegmentTranslations(
    segmentId: number,
    translations: { locale: string; label: string; sourceUpdatedAt: Date | null }[],
  ): Promise<void>;

  // Nav item translations (nav_item_translations)
  /**
   * Lists nav translations.
   *
   * @param navId - The `navId` value.
   * @returns The matching rows.
   */
  listNavTranslations(navId: NavId): Promise<NavItemTranslationRow[]>;
  /**
   * Replaces nav item translations.
   *
   * @param navItemId - The `navItemId` value.
   * @param translations - The `translations` value.
   * @returns A promise that resolves when the operation completes.
   */
  replaceNavItemTranslations(
    navItemId: number,
    translations: { locale: string; label: string; sourceUpdatedAt: Date | null }[],
  ): Promise<void>;
}
