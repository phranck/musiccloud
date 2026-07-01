/**
 * Repository contract for the API-access system (MC-025/MC-077): requests,
 * approved clients, their bearer tokens, and the audit trail. Shared by two
 * route surfaces — the admin dashboard (owner/admin review + moderation)
 * and the developer-portal self-service API (submit request, manage own
 * tokens) — since both act on the same underlying tables.
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
 * An approved API-client ("app") DTO.
 *
 * @property id - Stable client id (text PK, nanoid-generated).
 * @property requestId - Originating request, or `null` if created directly by an admin.
 * @property developerAccountId - Owning developer account.
 * @property appName - Name of the app.
 * @property contactEmail - Display contact email.
 * @property description - Free-text description.
 * @property status - `"active"` | `"suspended"` | `"revoked"`.
 * @property requestsPerMinute - Rate-limit ceiling (not yet enforced).
 * @property requestsPerDay - Daily quota ceiling (not yet enforced).
 * @property createdAt - Epoch ms.
 * @property updatedAt - Epoch ms.
 * @property createdByAdminId - Admin who created the client directly, or `null` when created via request approval.
 */
export interface ApiClient {
  id: string;
  requestId: string | null;
  developerAccountId: string;
  appName: string;
  contactEmail: string;
  description: string;
  status: string;
  requestsPerMinute: number;
  requestsPerDay: number;
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
  clientId: string | null;
  requestId: string | null;
  tokenId: string | null;
  eventType: string;
  actorAdminId: string | null;
  actorDeveloperAccountId: string | null;
  occurredAt: number;
  eventData: Record<string, unknown>;
}

/**
 * Persistence contract for the API-access system. See the file-level
 * comment for scope and the shared-ownership rationale.
 */
export interface ApiAccessRepository {
  /** Creates a new pending request for the given developer account. The id is generated by the implementation. */
  createApiAccessRequest(data: {
    developerAccountId: string;
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
    data: { status: "approved" | "rejected"; reviewedByAdminId: string; reviewNote?: string | null },
  ): Promise<ApiAccessRequest | null>;

  /** Creates a new client. The id is generated by the implementation; `status` starts `"active"`. */
  createApiClient(data: {
    requestId?: string | null;
    developerAccountId: string;
    appName: string;
    contactEmail: string;
    description: string;
    requestsPerMinute?: number;
    requestsPerDay?: number;
    createdByAdminId?: string | null;
  }): Promise<ApiClient>;

  /** Looks up a client by primary key. */
  findApiClientById(id: string): Promise<ApiClient | null>;

  /** Lists every client owned by the given developer account, newest first. */
  listApiClientsByDeveloperAccount(developerAccountId: string): Promise<ApiClient[]>;

  /** Lists clients, newest first, optionally filtered by `status`. */
  listApiClients(status?: string): Promise<ApiClient[]>;

  /** Patches `status`/`requestsPerMinute`/`requestsPerDay` and bumps `updatedAt`. Omitted fields are left unchanged. */
  updateApiClient(
    id: string,
    data: { status?: string; requestsPerMinute?: number; requestsPerDay?: number },
  ): Promise<ApiClient | null>;

  /** Creates a new active token for a client. The id is generated by the implementation. */
  createApiClientToken(data: {
    clientId: string;
    tokenPrefix: string;
    tokenHash: string;
    rotatedFromTokenId?: string | null;
  }): Promise<ApiClientToken>;

  /** Lists every token for a client, newest first (never exposes `tokenHash` to callers above the route-response layer — the DTO itself still carries it for internal comparisons). */
  listApiClientTokensByClient(clientId: string): Promise<ApiClientToken[]>;

  /** Looks up a token by primary key. */
  findApiClientTokenById(id: string): Promise<ApiClientToken | null>;

  /** Marks a token `"revoked"` and stamps `revokedAt`. Idempotent: revoking an already-revoked token is a no-op that still returns the row. */
  revokeApiClientToken(id: string): Promise<ApiClientToken | null>;

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

  /** Records an audit-trail entry. The id is generated by the implementation; `eventData` defaults to `{}`. */
  createApiAccessAuditEvent(data: {
    clientId?: string | null;
    requestId?: string | null;
    tokenId?: string | null;
    eventType: string;
    actorAdminId?: string | null;
    actorDeveloperAccountId?: string | null;
    eventData?: Record<string, unknown>;
  }): Promise<ApiAccessAuditEvent>;
}
