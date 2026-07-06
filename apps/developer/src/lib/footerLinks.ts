/**
 * @file Shared footer navigation for every public developer-portal page.
 *
 * The landing, docs, terms, privacy and pricing pages all render the same
 * footer link row; keeping the list here makes it the single source of truth
 * (adding a page means one edit, not five). The markup stays in each page's
 * template; only the data is shared.
 */

/**
 * A single footer navigation entry.
 *
 * @property href - Link target; absolute URL for external links.
 * @property label - Visible link text.
 * @property external - When `true`, the page renders the link with
 *   `target="_blank" rel="noopener noreferrer"`.
 */
export interface FooterLink {
  href: string;
  label: string;
  external?: boolean;
}

/**
 * Ordered footer links shared by all public portal pages. Docs and Pricing
 * live in the top nav (`PublicHeader`), not here; Status lives here only
 * (MC-102).
 */
export const FOOTER_LINKS: readonly FooterLink[] = [
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
  { href: "https://status.musiccloud.io", label: "Status", external: true },
];
