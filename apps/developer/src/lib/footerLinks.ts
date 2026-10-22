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
 * @property href - Link target, a path on the portal.
 * @property label - Visible link text.
 */
export interface FooterLink {
  href: string;
  label: string;
}

/**
 * Ordered footer links shared by all public portal pages. Docs and Pricing
 * live in the top nav (`PublicHeader`), not here.
 */
export const FOOTER_LINKS: readonly FooterLink[] = [
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
];
