import { createHash } from "node:crypto";

import {
  ContentContext,
  type ContentPublication,
  PageType,
  PublicationTemplateKey,
  type SingleContentContext,
} from "@musiccloud/shared";
import type { ContentPublicationCutoverPageCreate } from "./admin-repository.js";

/** The fields that make two publications the same, whoever stored them. */
type ComparablePublication = Pick<ContentPublication, "context" | "path" | "status" | "templateKey">;

/** Existing canonical publication that must remain unchanged during the cutover. */
export const PRIVACY_FRONTEND_PREREQUISITE = Object.freeze({
  context: ContentContext.Frontend,
  path: "/privacy",
  status: "published",
  templateKey: PublicationTemplateKey.FrontendDefault,
} as const satisfies ContentPublication);

/** The only publication the cutover may add to the existing Privacy Page. */
export const PRIVACY_DEVELOPER_PUBLICATION = Object.freeze({
  context: ContentContext.DeveloperPortal,
  path: "/privacy",
  status: "published",
  templateKey: PublicationTemplateKey.DeveloperDefault,
} as const satisfies ContentPublication);

/** The exact Frontend publication required on the canonical Terms Page. */
export const TERMS_FRONTEND_PUBLICATION = Object.freeze({
  context: ContentContext.Frontend,
  path: "/terms",
  status: "published",
  templateKey: PublicationTemplateKey.FrontendDefault,
} as const satisfies ContentPublication);

/** The exact Developer Portal publication required on the canonical Terms Page. */
export const TERMS_DEVELOPER_PUBLICATION = Object.freeze({
  context: ContentContext.DeveloperPortal,
  path: "/terms",
  status: "published",
  templateKey: PublicationTemplateKey.DeveloperDefault,
} as const satisfies ContentPublication);

/**
 * The key one route is claimed under: a context and a normalized path. The
 * cutover preflight and the locked apply both index claims by it, so the two
 * find the same duplicates.
 *
 * @param context - The context the route is published in.
 * @param path - The path, already normalized.
 * @returns A key that is equal for two claims on the same route.
 */
export function canonicalRouteKey(context: SingleContentContext, path: string): string {
  return `${context}:${path}`;
}

/**
 * The context mask a page's publications add up to. The cutover refuses a page
 * whose stored mask differs from it, in the preflight and under lock alike.
 *
 * @param publications - The page's publications.
 * @returns The contexts they publish in, as one mask.
 */
export function publicationContextMask(publications: ReadonlyArray<{ context: number }>): number {
  return publications.reduce((mask, publication) => mask | publication.context, 0);
}

/**
 * Whether two publications are the same: same context, path, status and
 * template. The paths are compared as given, so a caller comparing a stored
 * path normalizes it first.
 *
 * @param current - The publication as stored.
 * @param desired - The publication the cutover or backfill wants.
 * @returns `true` when nothing would change by writing `desired`.
 */
export function samePublication(current: ComparablePublication, desired: ComparablePublication): boolean {
  return (
    current.context === desired.context &&
    current.path === desired.path &&
    current.status === desired.status &&
    current.templateKey === desired.templateKey
  );
}

/** Stable, body-safe fingerprint shared by cutover preflight and locked apply. */
export function fingerprintContentPage(page: { title: string; content: string }): string {
  return createHash("sha256")
    .update(JSON.stringify({ title: page.title, content: page.content }))
    .digest("hex");
}

/** The reviewed Developer Portal placeholder promoted to canonical managed content. */
export const TERMS_BOOTSTRAP_PAGE: Readonly<ContentPublicationCutoverPageCreate> = Object.freeze({
  title: "Terms of Service",
  content:
    "The full Terms of Service for the musiccloud developer portal and API are being finalised and will be published here before public API access opens. Until then, this page is a placeholder.",
  contextMask: ContentContext.Frontend | ContentContext.DeveloperPortal,
  status: "published",
  showTitle: true,
  titleAlignment: "left",
  pageType: PageType.Default,
  displayMode: "fullscreen",
  overlayWidth: "regular",
  contentCardStyle: "default",
});

/** Prevents callers from replacing the reviewed bootstrap payload with arbitrary content. */
export function isCanonicalTermsBootstrapPage(page: ContentPublicationCutoverPageCreate): boolean {
  return (
    page.title === TERMS_BOOTSTRAP_PAGE.title &&
    page.content === TERMS_BOOTSTRAP_PAGE.content &&
    page.contextMask === TERMS_BOOTSTRAP_PAGE.contextMask &&
    page.status === TERMS_BOOTSTRAP_PAGE.status &&
    page.showTitle === TERMS_BOOTSTRAP_PAGE.showTitle &&
    page.titleAlignment === TERMS_BOOTSTRAP_PAGE.titleAlignment &&
    page.pageType === TERMS_BOOTSTRAP_PAGE.pageType &&
    page.displayMode === TERMS_BOOTSTRAP_PAGE.displayMode &&
    page.overlayWidth === TERMS_BOOTSTRAP_PAGE.overlayWidth &&
    page.contentCardStyle === TERMS_BOOTSTRAP_PAGE.contentCardStyle
  );
}
