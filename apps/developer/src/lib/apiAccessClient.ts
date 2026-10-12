/**
 * @file Browser-side client for the developer self-service API-access
 * endpoints (`/api/dev/api-access/*`, MC-089).
 *
 * The dashboard panels are React islands that call the same-origin BFF
 * (which proxies to the backend and relays the `mc_dev_session` cookie).
 * This module centralises the transport (JSON encode/decode, credentials,
 * error + 429 normalisation) and the response DTO shapes so the panels only
 * describe what they render. Server-side (SSR) reads live in
 * `apiAccessServer.ts` instead: different transport, same DTOs.
 */
import {
  type ApiClientStatusValue,
  type ApiTokenStatusValue,
  type ClientRegistrationTypeValue,
  type DeveloperProjectStatusValue,
  ENDPOINTS,
  ROUTE_TEMPLATES,
} from "@musiccloud/shared";

/** HTTP 429: the backend's rate-limit response, carrying `retryAfterSeconds`. */
export const HTTP_STATUS_TOO_MANY_REQUESTS = 429;

/**
 * An issued token as returned by the self-service endpoints. `rawToken` is
 * present exactly once, on the create/rotate response, and never again.
 */
export interface ApiTokenDto {
  /** Stable token id. */
  id: string;
  /** Non-secret display prefix, shown through `formatApiTokenForDisplay`. */
  tokenPrefix: string;
  /** Token status. */
  status: ApiTokenStatusValue;
  /** Creation timestamp, ISO-8601. */
  createdAt: string;
  /** Last authenticated use, ISO-8601, or `null` if never used. */
  lastUsedAt: string | null;
  /** Revocation timestamp, ISO-8601, or `null`. */
  revokedAt: string | null;
  /** The full secret token, present only on the create/rotate response. */
  rawToken?: string;
}

/** An approved API client with its tokens, as returned by `clientsList`. */
export interface ApiClientDto {
  /** Stable client id. */
  id: string;
  /** Owning project aggregate. */
  projectId: string;
  /** Public OAuth/client identifier, distinct from the internal row id. */
  publicClientId: string;
  /** Registration type describing how the client can protect credentials. */
  registrationType: ClientRegistrationTypeValue;
  /** Explicit authentication capabilities enabled for this registration. */
  capabilities: string[];
  /** Display name and lifecycle of the owning project. */
  projectDisplayName: string;
  projectStatus: DeveloperProjectStatusValue;
  /** Name of the app. */
  appName: string;
  /** Free-text description. */
  description: string;
  /** Where this one application can be looked at, or `null`. Always `http` or `https`. */
  websiteUrl: string | null;
  /** Client status. */
  status: ApiClientStatusValue;
  /** Per-minute request quota enforced by the public API, or `null` when the project has no granting plan. */
  requestsPerMinute: number | null;
  /** Per-day request quota enforced by the public API, or `null` when the project has no granting plan. */
  requestsPerDay: number | null;
  /** Creation timestamp, ISO-8601. */
  createdAt: string;
  /** The client's tokens, newest first. */
  tokens: ApiTokenDto[];
}

export interface DeveloperProjectDto {
  id: string;
  displayName: string;
  status: DeveloperProjectStatusValue;
  subscription: { tierId: string | null; tierName: string | null };
  quota: {
    /** The limit in force, or `null` when no granting subscription supplies a tier. */
    requestsPerMinute: number | null;
    /** The daily limit in force, or `null` when no granting subscription supplies a tier. */
    requestsPerDay: number | null;
    overrideRequestsPerMinute: number | null;
    overrideRequestsPerDay: number | null;
  };
  createdAt: string;
  updatedAt: string;
}

/** One step of a usage series, stamped with the moment the step begins. */
export interface UsageBucketDto {
  startedAt: string;
  total: number;
}

/** How many requests one registration made inside the summarised range. */
export interface UsageByRegistrationDto {
  registrationId: string;
  total: number;
}

/**
 * Aggregated usage for one project, with the quota it is measured against.
 *
 * The quota arrives with the counts rather than from a second read, so a
 * screen never shows a number against a limit taken at a different moment.
 */
export interface ProjectUsageDto {
  windows: {
    minute: { from: string; to: string; total: number };
    day: { from: string; to: string; total: number };
  };
  range: {
    from: string;
    to: string;
    bucket: string;
    total: number;
    byRegistration: UsageByRegistrationDto[];
    buckets: UsageBucketDto[];
  };
  quota: {
    /** What the plan grants per minute, or `null` when no plan grants one. */
    requestsPerMinute: number | null;
    /** What the plan grants per day, or `null` when no plan grants one. */
    requestsPerDay: number | null;
  };
}

/**
 * Normalised outcome of an API-access call.
 *
 * @property ok - Whether the response status was 2xx.
 * @property status - The HTTP status code (0 on a transport/network failure).
 * @property data - The parsed JSON body on success.
 * @property code - The backend `error` machine code on failure, if present.
 * @property message - The backend `message`, if present.
 * @property retryAfterSeconds - On a `429`, the backend's suggested wait.
 * @property errorId - The backend's unique id for the failed request, which is
 *   what connects what a developer sees to the one log line that explains it.
 */
export interface ApiAccessResult<T> {
  ok: boolean;
  status: number;
  data?: T;
  code?: string;
  message?: string;
  retryAfterSeconds?: number;
  errorId?: string;
}

/**
 * Fetch a same-origin API-access endpoint and normalise the result. Sends
 * `credentials: "same-origin"` so the BFF can forward the session cookie.
 * Never throws: transport failures yield `{ ok: false, status: 0 }`, and a
 * `429` surfaces the backend's `retryAfterSeconds` for a friendly retry hint.
 *
 * The content type is set only when there is something to describe. Fastify
 * refuses a request that announces JSON and then sends nothing, which is what
 * the three token routes do: they carry their subject in the path and have no
 * body at all.
 *
 * @param path - Same-origin endpoint path.
 * @param init - Optional method/body/signal; defaults to a GET.
 * @returns The normalised {@link ApiAccessResult}.
 */
async function requestJson<T>(path: string, init?: RequestInit): Promise<ApiAccessResult<T>> {
  try {
    const res = await fetch(path, {
      credentials: "same-origin",
      ...init,
      headers: {
        ...(init?.body === undefined ? {} : { "Content-Type": "application/json" }),
        ...init?.headers,
      },
    });

    let body: unknown;
    try {
      body = await res.json();
    } catch {
      // Empty or non-JSON body (e.g. a proxy error page); leave undefined.
    }

    if (res.ok) return { ok: true, status: res.status, data: body as T };

    const errorBody = (body ?? {}) as {
      error?: string;
      message?: string;
      errorId?: string;
      context?: { retryAfterSeconds?: number };
    };
    return {
      ok: false,
      status: res.status,
      code: errorBody.error,
      message: errorBody.message,
      errorId: errorBody.errorId,
      retryAfterSeconds: errorBody.context?.retryAfterSeconds,
    };
  } catch {
    return { ok: false, status: 0 };
  }
}

/**
 * Lists the caller's own API clients including their tokens (never a hash).
 *
 * @param signal - Abort signal for the mount effect's cleanup.
 */
export function listApiClients(signal?: AbortSignal): Promise<ApiAccessResult<{ clients: ApiClientDto[] }>> {
  return requestJson(ENDPOINTS.dev.apiAccess.clientsList, { signal });
}

/**
 * What a project's ceiling looks like to the browser: how many an account may
 * hold and how many it holds now. It travels with the list because the screen
 * that shows the projects is the one that says how many more may be created.
 */
export interface DeveloperProjectLimits {
  /** How many projects this account may hold at once. */
  maxProjects: number;
  /** How many it holds against that ceiling; a suspended project still counts. */
  usedProjects: number;
}

export function listDeveloperProjects(
  signal?: AbortSignal,
): Promise<ApiAccessResult<{ projects: DeveloperProjectDto[]; limits: DeveloperProjectLimits }>> {
  return requestJson(ENDPOINTS.dev.apiAccess.projects, { signal });
}

export function createDeveloperProject(
  displayName: string,
): Promise<ApiAccessResult<{ project: DeveloperProjectDto }>> {
  return requestJson(ENDPOINTS.dev.apiAccess.projects, {
    method: "POST",
    body: JSON.stringify({ displayName }),
  });
}

export function getDeveloperProject(
  projectId: string,
  signal?: AbortSignal,
): Promise<ApiAccessResult<{ project: DeveloperProjectDto; registrations: ApiClientDto[] }>> {
  return requestJson(ENDPOINTS.dev.apiAccess.projectDetail(projectId), { signal });
}

export function updateDeveloperProject(
  projectId: string,
  body: { displayName?: string; status?: DeveloperProjectStatusValue },
): Promise<ApiAccessResult<{ project: DeveloperProjectDto }>> {
  return requestJson(ENDPOINTS.dev.apiAccess.projectDetail(projectId), {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

/**
 * Chooses the plan for one of the caller's own projects.
 *
 * @param projectId - The project the plan is for.
 * @param tierId - The tier the developer picked.
 */
export function setDeveloperProjectPlan(
  projectId: string,
  tierId: string,
): Promise<ApiAccessResult<{ project: DeveloperProjectDto }>> {
  return requestJson(ENDPOINTS.dev.apiAccess.projectSubscription(projectId), {
    method: "PUT",
    body: JSON.stringify({ tierId }),
  });
}

export function createClientRegistration(
  projectId: string,
  body: {
    name: string;
    description?: string;
    websiteUrl?: string | null;
    registrationType: ClientRegistrationTypeValue;
    capabilities?: string[];
  },
): Promise<ApiAccessResult<{ registration: ApiClientDto }>> {
  return requestJson(ENDPOINTS.dev.apiAccess.projectRegistrations(projectId), {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/**
 * Changes one of the caller's own registrations.
 *
 * Suspending or revoking one stops every token under it from authenticating,
 * which is what makes a withdrawal hit a single application.
 *
 * @param registrationId - The registration to change.
 * @param body - The lifecycle state, the application website, or the description.
 */
export function updateClientRegistration(
  registrationId: string,
  body: { status?: ApiClientStatusValue; websiteUrl?: string | null; description?: string },
): Promise<ApiAccessResult<{ registration: ApiClientDto }>> {
  return requestJson(ENDPOINTS.dev.apiAccess.registrationDetail(registrationId), {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

/**
 * Creates a new token for one of the caller's own clients. The response's
 * `token.rawToken` is shown exactly once.
 *
 * @param clientId - The owning client.
 */
export function createClientToken(clientId: string): Promise<ApiAccessResult<{ token: ApiTokenDto }>> {
  return requestJson(ROUTE_TEMPLATES.dev.apiAccess.clientCreateToken.replace(":id", clientId), { method: "POST" });
}

/**
 * Rotates one of the caller's own tokens: the old token is invalidated and
 * the response carries the replacement's `rawToken` exactly once.
 *
 * @param tokenId - The token to rotate.
 */
export function rotateClientToken(tokenId: string): Promise<ApiAccessResult<{ token: ApiTokenDto }>> {
  return requestJson(ROUTE_TEMPLATES.dev.apiAccess.tokenRotate.replace(":id", tokenId), { method: "POST" });
}

/**
 * Revokes one of the caller's own tokens permanently.
 *
 * @param tokenId - The token to revoke.
 */
export function revokeClientToken(tokenId: string): Promise<ApiAccessResult<{ token: ApiTokenDto }>> {
  return requestJson(ROUTE_TEMPLATES.dev.apiAccess.tokenRevoke.replace(":id", tokenId), { method: "POST" });
}
