import { randomUUID } from "node:crypto";
import {
  type DeveloperPortalEditorialPage,
  type DeveloperPortalNavigation,
  type DeveloperPortalNavigationItem,
  ENDPOINTS,
  isNavigationSystemKey,
  NAVIGATION_SYSTEM_TARGETS,
  NavigationArea,
  NavigationSystemKey,
  NavigationTargetKind,
  NavTarget,
  type SingleNavigationArea,
} from "@musiccloud/shared";

import { backendUrl, internalHeaders } from "./api";
import { FOOTER_LINKS } from "./footerLinks";
import { PUBLIC_NAV_ITEMS, PUBLIC_SEARCH_COMMAND } from "./publicNavigation";

const EDITORIAL_TIMEOUT_MS = 3_000;
const MANAGED_ROUTE_RESERVED_PREFIXES = [
  "/docs",
  "/dashboard",
  "/api",
  "/auth",
  "/login",
  "/signup",
  "/forgot",
  "/reset",
  "/verify",
  "/pricing",
] as const;

export interface EditorialFailure {
  code: string;
  errorId: string;
  message: string;
  status: number;
}

export type EditorialResult<T> =
  | { status: "success"; data: T }
  | { status: "not-found" }
  | { status: "failure"; error: EditorialFailure };

function normalizeManagedPath(path: string): string | null {
  const candidate = path.trim();
  if (!candidate || candidate.includes("\\") || /%(?:2f|5c)/i.test(candidate)) return null;

  let decoded: string;
  try {
    decoded = decodeURIComponent(candidate);
  } catch {
    return null;
  }
  if (decoded.includes("?") || decoded.includes("#") || decoded.includes("\0")) return null;

  const segments = decoded
    .normalize("NFC")
    .split("/")
    .filter((segment) => segment.length > 0);
  if (segments.some((segment) => segment === "." || segment === "..")) return null;
  return segments.length === 0 ? "/" : `/${segments.join("/")}`;
}

/** Whether a request may reach the managed editorial Page lookup. */
export function isManagedEditorialPath(path: string): boolean {
  const normalized = normalizeManagedPath(path);
  if (!normalized || normalized === "/") return false;
  return !MANAGED_ROUTE_RESERVED_PREFIXES.some(
    (reserved) => normalized === reserved || normalized.startsWith(`${reserved}/`),
  );
}

function syntheticFailure(status: number, message: string, code = "MC-SYS-0001"): EditorialFailure {
  return { code, errorId: randomUUID(), message, status };
}

function errorPayload(value: unknown, status: number): EditorialFailure | null {
  if (typeof value !== "object" || value === null) return null;
  if (!("error" in value) || !("errorId" in value) || !("message" in value)) return null;
  if (typeof value.error !== "string" || typeof value.errorId !== "string" || typeof value.message !== "string") {
    return null;
  }
  if (!value.error || !value.errorId || !value.message) return null;
  return { code: value.error, errorId: value.errorId, message: value.message, status };
}

async function responsePayload(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function isEditorialPage(value: unknown): value is DeveloperPortalEditorialPage {
  if (typeof value !== "object" || value === null) return false;
  const page = value as Partial<DeveloperPortalEditorialPage>;
  return (
    typeof page.id === "string" &&
    typeof page.path === "string" &&
    page.path.startsWith("/") &&
    typeof page.title === "string" &&
    typeof page.showTitle === "boolean" &&
    (page.titleAlignment === "left" || page.titleAlignment === "center" || page.titleAlignment === "right") &&
    (page.pageType === "default" || page.pageType === "segmented") &&
    (page.displayMode === "fullscreen" || page.displayMode === "embossed" || page.displayMode === "translucent") &&
    (page.overlayWidth === "small" || page.overlayWidth === "regular" || page.overlayWidth === "big") &&
    (page.contentCardStyle === "default" || page.contentCardStyle === "recessed") &&
    typeof page.templateKey === "string" &&
    page.templateKey.length > 0 &&
    typeof page.contentHtml === "string"
  );
}

function isNavigationItem(value: unknown): value is DeveloperPortalNavigationItem {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Partial<DeveloperPortalNavigationItem>;
  const hasBaseShape =
    typeof item.id === "string" &&
    item.id.length > 0 &&
    typeof item.label === "string" &&
    item.label.length > 0 &&
    typeof item.href === "string" &&
    item.href.length > 0 &&
    (item.target === NavTarget.Self || item.target === NavTarget.Blank) &&
    (item.targetKind === NavigationTargetKind.Page ||
      item.targetKind === NavigationTargetKind.Url ||
      item.targetKind === NavigationTargetKind.System) &&
    (item.behavior === "navigate" || item.behavior === "open-api-search");
  if (!hasBaseShape) return false;

  if (item.targetKind === NavigationTargetKind.System) {
    if (!isNavigationSystemKey(item.systemKey)) return false;
    const descriptor = NAVIGATION_SYSTEM_TARGETS[item.systemKey];
    return (
      item.href === descriptor.canonicalRoute &&
      item.target === descriptor.target &&
      item.behavior === descriptor.behavior
    );
  }

  return item.systemKey === null && item.behavior === "navigate";
}

function isNavigation(value: unknown, area: SingleNavigationArea): value is DeveloperPortalNavigation {
  if (typeof value !== "object" || value === null) return false;
  const navigation = value as Partial<DeveloperPortalNavigation>;
  return navigation.area === area && Array.isArray(navigation.items) && navigation.items.every(isNavigationItem);
}

function logFailure(operation: string, outcome: string, error: EditorialFailure, fields = {}): void {
  console.warn(
    JSON.stringify({
      errorCode: error.code,
      errorId: error.errorId,
      operation,
      outcome,
      status: error.status,
      ...fields,
    }),
  );
}

/** Reads one published managed Page without exposing context selection. */
export async function fetchEditorialPage(path: string): Promise<EditorialResult<DeveloperPortalEditorialPage>> {
  const normalized = normalizeManagedPath(path);
  if (!normalized || !isManagedEditorialPath(normalized)) return { status: "not-found" };

  try {
    const response = await fetch(backendUrl(ENDPOINTS.internal.developer.editorial.page(normalized)), {
      headers: internalHeaders(),
      signal: AbortSignal.timeout(EDITORIAL_TIMEOUT_MS),
    });
    const payload = await responsePayload(response);
    if (response.status === 404) return { status: "not-found" };
    if (!response.ok) {
      const error =
        errorPayload(payload, response.status) ??
        syntheticFailure(response.status, "Developer content is temporarily unavailable.");
      logFailure("developer_portal_editorial_page_read", "failure", error);
      return { status: "failure", error };
    }
    if (!isEditorialPage(payload)) {
      const error = syntheticFailure(502, "Developer content returned an invalid response.");
      logFailure("developer_portal_editorial_page_read", "invalid_payload", error);
      return { status: "failure", error };
    }
    return { status: "success", data: payload };
  } catch {
    const error = syntheticFailure(503, "Developer content is temporarily unavailable.", "MC-API-0001");
    logFailure("developer_portal_editorial_page_read", "request_failed", error);
    return { status: "failure", error };
  }
}

function areaName(area: SingleNavigationArea): "main" | "footer" {
  return area === NavigationArea.Main ? "main" : "footer";
}

/** Reads one managed Developer Portal navigation projection. */
export async function fetchDeveloperPortalNavigation(
  area: SingleNavigationArea,
): Promise<EditorialResult<DeveloperPortalNavigation>> {
  try {
    const response = await fetch(backendUrl(ENDPOINTS.internal.developer.editorial.navigation(areaName(area))), {
      headers: internalHeaders(),
      signal: AbortSignal.timeout(EDITORIAL_TIMEOUT_MS),
    });
    const payload = await responsePayload(response);
    if (response.status === 404) return { status: "not-found" };
    if (!response.ok) {
      return {
        status: "failure",
        error:
          errorPayload(payload, response.status) ??
          syntheticFailure(response.status, "Developer navigation is temporarily unavailable."),
      };
    }
    if (!isNavigation(payload, area)) {
      return {
        status: "failure",
        error: syntheticFailure(502, "Developer navigation returned an invalid response."),
      };
    }
    return { status: "success", data: payload };
  } catch {
    return {
      status: "failure",
      error: syntheticFailure(503, "Developer navigation is temporarily unavailable.", "MC-API-0001"),
    };
  }
}

const STATIC_MAIN_FALLBACK: DeveloperPortalNavigationItem[] = [
  ...PUBLIC_NAV_ITEMS.map((item) => ({
    id: `fallback-${item.id}`,
    label: item.label,
    href: item.href,
    target: NavTarget.Self,
    targetKind: item.id === "pricing" ? NavigationTargetKind.Url : NavigationTargetKind.System,
    systemKey:
      item.id === "docs" ? NavigationSystemKey.Docs : item.id === "api" ? NavigationSystemKey.ApiReference : null,
    behavior: "navigate" as const,
  })),
  {
    id: "fallback-search",
    label: PUBLIC_SEARCH_COMMAND.label,
    href: PUBLIC_SEARCH_COMMAND.href,
    target: NavTarget.Self,
    targetKind: NavigationTargetKind.System,
    systemKey: NavigationSystemKey.Search,
    behavior: "open-api-search",
  },
];

const STATIC_FOOTER_FALLBACK: DeveloperPortalNavigationItem[] = FOOTER_LINKS.map((item, index) => ({
  id: `fallback-footer-${index}`,
  label: item.label,
  href: item.href,
  target: item.external ? NavTarget.Blank : NavTarget.Self,
  targetKind: NavigationTargetKind.Url,
  systemKey: null,
  behavior: "navigate",
}));

const lastGoodNavigation = new Map<SingleNavigationArea, DeveloperPortalNavigationItem[]>([
  [NavigationArea.Main, STATIC_MAIN_FALLBACK],
  [NavigationArea.Footer, STATIC_FOOTER_FALLBACK],
]);

/** Returns managed navigation, retaining the previous safe value on every failure. */
export async function getDeveloperPortalNavigation(
  area: SingleNavigationArea,
): Promise<readonly DeveloperPortalNavigationItem[]> {
  const result = await fetchDeveloperPortalNavigation(area);
  if (result.status === "success") {
    lastGoodNavigation.set(area, result.data.items);
    return result.data.items;
  }

  const error =
    result.status === "failure"
      ? result.error
      : syntheticFailure(404, "Developer navigation was not found.", "MC-RES-0003");
  logFailure("developer_portal_navigation_read", "last_good_fallback", error, { area: areaName(area) });
  return lastGoodNavigation.get(area) ?? [];
}
