/**
 * Repository contract for Developer Projects, client registrations, their
 * credentials, usage, access requests, and audit trail. Shared by two route
 * surfaces: the admin dashboard (owner/admin review + moderation)
 * and the developer-portal self-service API (submit request, manage own
 * projects and credentials), since both act on the same aggregate data.
 *
 * Kept separate from {@link AdminRepository} and `DeveloperRepository`:
 * neither admin users nor developer accounts own this data outright, both
 * merely act on it through different lenses.
 */

/**
 * An API-access request DTO.
 *
 * @property id - Stable request id (text PK, nanoid-generated).
 * @property developerAccountId - Owning developer account (source of truth).
 * @property contactEmail - Display snapshot of the account's email at submission time.
 * @property appName - Name of the requesting app.
 * @property appDescription - Free-text description of the app/use case.
 * @property estimatedRequestsPerDay - Applicant's own volume estimate.
 * @property status - `"pending"` | `"approved"` | `"rejected"` | `"archived"`.
 * @property submittedAt - Epoch ms.
 * @property reviewedAt - Epoch ms, or `null` while still pending.
 * @property reviewedByAdminId - Admin who approved/rejected, or `null`.
 * @property reviewNote - Reviewer note; required by the route layer on reject.
 */
export interface ApiAccessRequest {
  id: string;
  developerAccountId: string;
  projectId: string | null;
  contactEmail: string;
  appName: string;
  appDescription: string;
  estimatedRequestsPerDay: number;
  status: string;
  submittedAt: number;
  reviewedAt: number | null;
  reviewedByAdminId: string | null;
  reviewNote: string | null;
}

/**
 * Aggregate root for one independently subscribed and metered Developer API
 * application. Credential material is intentionally absent and remains owned
 * by registrations below this project.
 */
export interface DeveloperProject {
  id: string;
  developerAccountId: string;
  displayName: string;
  status: string;
  requestsPerMinute: number | null;
  requestsPerDay: number | null;
  tierId: string | null;
  tierName: string | null;
  tierRequestsPerMinute: number | null;
  tierRequestsPerDay: number | null;
  effectiveRequestsPerMinute: number;
  effectiveRequestsPerDay: number;
  createdAt: number;
  updatedAt: number;
  suspendedAt: number | null;
  deletedAt: number | null;
  createdByAdminId: string | null;
}

export interface DeveloperProjectSubscription {
  id: string;
  projectId: string;
  tierId: string | null;
  creemSubscriptionId: string | null;
  creemCustomerId: string | null;
  status: string;
  interval: string | null;
  currentPeriodEnd: number | null;
  cancelAtPeriodEnd: boolean;
  createdAt: number;
  updatedAt: number;
}

/**
 * An approved API registration DTO. Every read resolves the owning project's
 * quota override and tier alongside the registration cap so consumers always
 * see both the raw inputs and the effective limits.
 *
 * @property id - Stable client id (text PK, nanoid-generated).
 * @property requestId - Originating request, or `null` if created directly by an admin.
 * @property developerAccountId - Owning developer account.
 * @property appName - Name of the app.
 * @property contactEmail - Display contact email.
 * @property description - Free-text description.
 * @property status - `"active"` | `"suspended"` | `"revoked"`.
 * @property requestsPerMinute - Optional registration cap, or `null` to use the project limit.
 * @property requestsPerDay - Optional daily registration cap, or `null` to use the project limit.
 * @property tierId - The owning project's assigned tier id, or `null` when unassigned.
 * @property tierName - Display name of that tier, or `null`.
 * @property tierRequestsPerMinute - The tier's per-minute limit, or `null` when unassigned.
 * @property tierRequestsPerDay - The tier's per-day limit, or `null` when unassigned.
 * @property effectiveRequestsPerMinute - Project limit narrowed by the optional registration cap.
 * @property effectiveRequestsPerDay - Daily project limit narrowed by the optional registration cap.
 * @property createdAt - Epoch ms.
 * @property updatedAt - Epoch ms.
 * @property createdByAdminId - Admin who created the client directly, or `null` when created via request approval.
 */
export interface ApiClient {
  id: string;
  requestId: string | null;
  developerAccountId: string;
  projectId: string;
  publicClientId: string;
  registrationType: string;
  capabilities: string[];
  projectDisplayName: string;
  projectStatus: string;
  projectRequestsPerMinute: number | null;
  projectRequestsPerDay: number | null;
  appName: string;
  contactEmail: string;
  description: string;
  status: string;
  requestsPerMinute: number | null;
  requestsPerDay: number | null;
  tierId: string | null;
  tierName: string | null;
  tierRequestsPerMinute: number | null;
  tierRequestsPerDay: number | null;
  effectiveRequestsPerMinute: number;
  effectiveRequestsPerDay: number;
  createdAt: number;
  updatedAt: number;
  createdByAdminId: string | null;
}

/**
 * An issued bearer token DTO. Never carries the raw token or a
 * reconstructable secret — only `tokenPrefix` (safe to display) and
 * `tokenHash` (opaque, used only for lookup-equality).
 *
 * @property id - Stable token id (text PK, nanoid-generated).
 * @property clientId - Owning client.
 * @property tokenPrefix - Non-secret display prefix.
 * @property tokenHash - Hex-encoded SHA-256 of the raw token.
 * @property status - `"active"` | `"revoked"` | `"rotated"`.
 * @property createdAt - Epoch ms.
 * @property lastUsedAt - Epoch ms, or `null` if never used (enforcement is MC-025 Phase 2, so this stays `null` in this round).
 * @property revokedAt - Epoch ms, or `null`.
 * @property rotatedFromTokenId - Id of the token this one replaced, or `null`.
 */
export interface ApiClientToken {
  id: string;
  clientId: string;
  tokenPrefix: string;
  tokenHash: string;
  rawToken?: string | null;
  status: string;
  createdAt: number;
  lastUsedAt: number | null;
  revokedAt: number | null;
  rotatedFromTokenId: string | null;
}

/**
 * An audit-trail entry DTO. Exactly one of `actorAdminId` /
 * `actorDeveloperAccountId` is set per row.
 *
 * @property id - Stable event id (text PK, nanoid-generated).
 * @property clientId - Related client, or `null`.
 * @property requestId - Related request, or `null`.
 * @property tokenId - Related token, or `null`.
 * @property eventType - e.g. `"request_submitted"`, `"token_rotated"`.
 * @property actorAdminId - Acting admin, or `null` for developer self-service actions.
 * @property actorDeveloperAccountId - Acting developer, or `null` for admin actions.
 * @property occurredAt - Epoch ms.
 * @property eventData - Small structured context; never contains raw tokens/hashes.
 */
export interface ApiAccessAuditEvent {
  id: string;
  projectId: string | null;
  clientId: string | null;
  requestId: string | null;
  tokenId: string | null;
  eventType: string;
  actorAdminId: string | null;
  actorDeveloperAccountId: string | null;
  occurredAt: number;
  eventData: Record<string, unknown>;
}

export interface ApiUsageEvent {
  id: string;
  occurredAt: number;
  requestId: string;
  projectId: string;
  registrationId: string;
  tokenId: string | null;
  method: string;
  endpointTemplate: string;
  statusCode: number;
  durationMs: number;
}

/**
 * Persistence contract for the API-access system. See the file-level
 * comment for scope and the shared-ownership rationale.
 */
export interface ApiAccessRepository {
  /** Creates one independently subscribed and metered project for an account. */
  createDeveloperProject(data: {
    developerAccountId: string;
    displayName: string;
    requestsPerMinute?: number | null;
    requestsPerDay?: number | null;
    tierId?: string | null;
    createdByAdminId?: string | null;
  }): Promise<DeveloperProject>;

  findDeveloperProjectById(id: string): Promise<DeveloperProject | null>;

  listDeveloperProjectsByAccount(developerAccountId: string): Promise<DeveloperProject[]>;

  updateDeveloperProject(
    id: string,
    data: {
      displayName?: string;
      status?: "active" | "suspended" | "deleted";
      requestsPerMinute?: number | null;
      requestsPerDay?: number | null;
    },
  ): Promise<DeveloperProject | null>;

  setDeveloperProjectSubscription(data: {
    projectId: string;
    tierId: string | null;
    creemSubscriptionId?: string | null;
    creemCustomerId?: string | null;
    status?: string;
    interval?: string | null;
    currentPeriodEnd?: number | null;
    cancelAtPeriodEnd?: boolean;
  }): Promise<DeveloperProjectSubscription>;

  findDeveloperProjectSubscription(projectId: string): Promise<DeveloperProjectSubscription | null>;

  /** Creates a new pending request for the given developer account. The id is generated by the implementation. */
  createApiAccessRequest(data: {
    developerAccountId: string;
    projectId?: string | null;
    contactEmail: string;
    appName: string;
    appDescription: string;
    estimatedRequestsPerDay: number;
  }): Promise<ApiAccessRequest>;

  /** Looks up a request by primary key. */
  findApiAccessRequestById(id: string): Promise<ApiAccessRequest | null>;

  /** Lists every request submitted by the given developer account, newest first. */
  listApiAccessRequestsByDeveloperAccount(developerAccountId: string): Promise<ApiAccessRequest[]>;

  /** Lists requests, newest first, optionally filtered by `status`. */
  listApiAccessRequests(status?: string): Promise<ApiAccessRequest[]>;

  /**
   * Sets a request's review outcome (`status`, `reviewedAt = NOW()`,
   * `reviewedByAdminId`, `reviewNote`). Does not create the client — the
   * route layer calls {@link createApiClient} separately on approval so
   * both writes can share one audit-event bundle.
   */
  reviewApiAccessRequest(
    id: string,
    data: {
      status: "approved" | "rejected";
      reviewedByAdminId: string;
      reviewNote?: string | null;
      projectId?: string | null;
    },
  ): Promise<ApiAccessRequest | null>;

  /**
   * Creates a new registration. The id is generated by the implementation;
   * `status` starts `"active"`. Omitted rate-limit fields are stored as
   * `NULL`, so the registration uses the owning project's effective limits.
   */
  createApiClient(data: {
    requestId?: string | null;
    developerAccountId: string;
    projectId?: string | null;
    registrationType?: "development" | "confidential" | "public";
    capabilities?: string[];
    appName: string;
    contactEmail: string;
    description: string;
    requestsPerMinute?: number | null;
    requestsPerDay?: number | null;
    createdByAdminId?: string | null;
  }): Promise<ApiClient>;

  /** Looks up a client by primary key. */
  findApiClientById(id: string): Promise<ApiClient | null>;

  /** Lists every client owned by the given developer account, newest first. */
  listApiClientsByDeveloperAccount(developerAccountId: string): Promise<ApiClient[]>;

  /** Lists every registration owned by one project, newest first. */
  listApiClientsByProject(projectId: string): Promise<ApiClient[]>;

  /** Lists clients, newest first, optionally filtered by `status`. */
  listApiClients(status?: string): Promise<ApiClient[]>;

  /**
   * Patches `status`/`requestsPerMinute`/`requestsPerDay` and bumps
   * `updatedAt`. Omitted (`undefined`) fields are left unchanged; passing
   * `null` for a rate-limit field explicitly clears the override so the
   * registration uses the project limit again.
   */
  updateApiClient(
    id: string,
    data: { status?: string; requestsPerMinute?: number | null; requestsPerDay?: number | null },
  ): Promise<ApiClient | null>;

  /** Creates a new active token for a client. The id is generated by the implementation. */
  createApiClientToken(data: {
    clientId: string;
    tokenPrefix: string;
    tokenHash: string;
    rawToken: string;
    rotatedFromTokenId?: string | null;
  }): Promise<ApiClientToken>;

  /** Lists every token for a client, newest first (never exposes `tokenHash` to callers above the route-response layer — the DTO itself still carries it for internal comparisons). */
  listApiClientTokensByClient(clientId: string): Promise<ApiClientToken[]>;

  /** Looks up a token by primary key. */
  findApiClientTokenById(id: string): Promise<ApiClientToken | null>;

  /**
   * Resolves an incoming `X-API-Key` bearer value to its registration for
   * public-API authentication (MC-088). Matches on the token's SHA-256
   * hash and returns a hit only when the project, registration, and token are
   * all `"active"`. Every inactive or unknown combination misses so the auth
   * layer can treat it as a plain 401. The returned registration carries the resolved
   * `effectiveRequestsPerMinute`/`effectiveRequestsPerDay`, which
   * `authenticatePublic` enforces (MC-100).
   *
   * @param tokenHash - Hex-encoded SHA-256 of the raw token (`hashApiToken`).
   * @returns The active project, registration, and token, or `null` on any miss.
   */
  findActiveApiClientByTokenHash(
    tokenHash: string,
  ): Promise<{ project: DeveloperProject; client: ApiClient; token: ApiClientToken } | null>;

  /**
   * Stamps a token's `lastUsedAt` to now. Called fire-and-forget from the
   * public-API auth hot path on every token-authenticated request, so it
   * must stay a single cheap UPDATE.
   *
   * @param tokenId - The token whose usage timestamp to bump.
   */
  touchApiClientTokenLastUsed(tokenId: string): Promise<void>;

  /** Marks a token `"revoked"` and stamps `revokedAt`. Idempotent: revoking an already-revoked token is a no-op that still returns the row. */
  revokeApiClientToken(id: string): Promise<ApiClientToken | null>;

  /** Sets a revoked token back to `"active"` and clears `revokedAt`. Returns null if the token was not revoked. */
  activateApiClientToken(id: string): Promise<ApiClientToken | null>;

  /**
   * Atomically marks the given token `"rotated"` and creates a new active
   * token on the same client with `rotatedFromTokenId` set to the old
   * token's id. Runs both writes in one transaction.
   *
   * @returns Both tokens, or `null` if the given id does not match an
   *   existing, still-active token.
   */
  rotateApiClientToken(
    id: string,
    data: { newTokenPrefix: string; newTokenHash: string },
  ): Promise<{ oldToken: ApiClientToken; newToken: ApiClientToken } | null>;

  /** Returns the number of api_access_requests with status = 'pending'. */
  countPendingApiAccessRequests(): Promise<number>;

  /** Records an audit-trail entry. The id is generated by the implementation; `eventData` defaults to `{}`. */
  createApiAccessAuditEvent(data: {
    projectId?: string | null;
    clientId?: string | null;
    requestId?: string | null;
    tokenId?: string | null;
    eventType: string;
    actorAdminId?: string | null;
    actorDeveloperAccountId?: string | null;
    eventData?: Record<string, unknown>;
  }): Promise<ApiAccessAuditEvent>;

  /** Persists safe project-scoped usage metadata for one completed request. */
  createApiUsageEvent(data: {
    requestId: string;
    projectId: string;
    registrationId: string;
    tokenId?: string | null;
    method: string;
    endpointTemplate: string;
    statusCode: number;
    durationMs: number;
  }): Promise<ApiUsageEvent>;
}
