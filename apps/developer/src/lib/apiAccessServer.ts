/**
 * @file Server-side (SSR) reads for the developer's API-access data.
 *
 * The Usage page and the dashboard rail render in `.astro` frontmatter, so they
 * fetch server-to-server like `session.ts` does: forward the `mc_dev_session`
 * cookie and the real client IP to the backend.
 * Browser-side calls (the interactive panels) live in `apiAccessClient.ts`;
 * both share the same DTO shapes.
 */
import { ENDPOINTS } from "@musiccloud/shared";
import type { AstroGlobal } from "astro";
import { backendUrl, internalHeaders } from "@/lib/api";
import type { ApiClientDto, DeveloperProjectDto, ProjectUsageDto } from "@/lib/apiAccessClient";

/** Session cookie name, in lockstep with `session.ts` / the backend. */
const SESSION_COOKIE_NAME = "mc_dev_session";

/**
 * Loads the caller's own API clients (with tokens) server-side for SSR
 * rendering. Returns `null` on a missing session or any fetch failure so the
 * page can branch without a try/catch, distinguishing "no clients" (`[]`)
 * from "could not load" (`null`).
 *
 * @param astro - The Astro global; only `cookies` and `clientAddress` are read.
 * @returns The client list, or `null` when the data could not be loaded.
 */
export async function getOwnApiClients(astro: AstroGlobal): Promise<ApiClientDto[] | null> {
  const sessionCookie = astro.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionCookie) return null;

  try {
    const res = await fetch(backendUrl(ENDPOINTS.dev.apiAccess.clientsList), {
      headers: internalHeaders(astro.clientAddress, {
        cookie: `${SESSION_COOKIE_NAME}=${sessionCookie}`,
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { clients: ApiClientDto[] };
    return data.clients;
  } catch {
    return null;
  }
}

/**
 * Loads one project's usage server-side.
 *
 * The usage page renders in frontmatter, so it reads server-to-server like the
 * rest of this file. A failure comes back as `null` so the page can tell "this
 * project has never been called" from "the figures could not be loaded", which
 * are two different things to say to a developer.
 *
 * @param astro - The Astro global; only `cookies` and `clientAddress` are read.
 * @param projectId - The project to report on.
 * @returns The usage report, or `null` when it could not be loaded.
 */
export async function getProjectUsage(astro: AstroGlobal, projectId: string): Promise<ProjectUsageDto | null> {
  const sessionCookie = astro.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionCookie) return null;

  try {
    const res = await fetch(backendUrl(ENDPOINTS.dev.apiAccess.projectUsage(projectId)), {
      headers: internalHeaders(astro.clientAddress, {
        cookie: `${SESSION_COOKIE_NAME}=${sessionCookie}`,
      }),
    });
    if (!res.ok) return null;
    return (await res.json()) as ProjectUsageDto;
  } catch {
    return null;
  }
}

/**
 * What the projects endpoint answers with: the caller's projects and the
 * ceiling the creation route enforces.
 */
export interface OwnProjects {
  projects: DeveloperProjectDto[];
  /** How many projects this account may hold at once. */
  maxProjects: number;
  /** How many it holds against that ceiling; a suspended project still counts. */
  usedProjects: number;
}

/**
 * Loads the caller's projects and their ceiling server-side.
 *
 * The rail lists the projects and the overview states how many are left, and
 * both render before any island hydrates, which is why this is a server read
 * rather than a second browser request.
 *
 * @param astro - The Astro global; only `cookies` and `clientAddress` are read.
 * @returns The projects with their ceiling, or `null` when the data could not
 *   be loaded, so a caller can tell that apart from holding no projects.
 */
export function getOwnProjects(astro: AstroGlobal): Promise<OwnProjects | null> {
  // The rail and the page that lists the projects both want this, and both
  // render in the same request. Keyed on the request itself, the second caller
  // waits on the first one's promise instead of asking the backend again.
  const pending = projectsInFlight.get(astro.request);
  if (pending) return pending;
  const started = readOwnProjects(astro);
  projectsInFlight.set(astro.request, started);
  return started;
}

/** One request's read of the projects, shared by everything rendering it. */
const projectsInFlight = new WeakMap<Request, Promise<OwnProjects | null>>();

async function readOwnProjects(astro: AstroGlobal): Promise<OwnProjects | null> {
  const sessionCookie = astro.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionCookie) return null;

  try {
    const res = await fetch(backendUrl(ENDPOINTS.dev.apiAccess.projects), {
      headers: internalHeaders(astro.clientAddress, {
        cookie: `${SESSION_COOKIE_NAME}=${sessionCookie}`,
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      projects: DeveloperProjectDto[];
      limits: { maxProjects: number; usedProjects: number };
    };
    return { projects: data.projects, maxProjects: data.limits.maxProjects, usedProjects: data.limits.usedProjects };
  } catch {
    return null;
  }
}
