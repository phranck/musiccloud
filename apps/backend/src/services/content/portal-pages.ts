/**
 * @file The portal pages that must exist, and their copy as it was written.
 *
 * `/docs` and `/pricing` are the two pages a developer reads before deciding
 * whether to build against us. They used to be markup, so a sentence on either
 * was a commit, a review and a deployment. They are content pages now, edited
 * in the dashboard like the rest.
 *
 * That leaves one problem a purely editorial page does not have: the portal has
 * to serve something at both paths from the moment it starts, and nobody has
 * written them yet. So the copy they went in with lives here, and a page that
 * is missing is created from it.
 *
 * **Nothing here ever overwrites a page that exists.** These are starting
 * points, not the source of truth: the moment somebody edits one in the
 * dashboard, the dashboard is what it says, and this file is history. A page
 * deleted on purpose does come back, which is the cost of the two paths always
 * answering, and is why only pages that must exist belong in this list.
 */

import { ContentContext } from "@musiccloud/shared";
import { getAdminRepository } from "../../db/index.js";
import { DOCS_PAGE_CONTENT } from "./portal-pages/docs.js";
import { PRICING_PAGE_CONTENT } from "./portal-pages/pricing.js";

/** The template the portal renders an editorial page with. */
const PORTAL_TEMPLATE_KEY = "developer-default";

/** One page the portal must be able to serve. */
interface PortalPageSeed {
  slug: string;
  title: string;
  /** Where it is served, which is also what any link to it says. */
  path: string;
  /** The Markdown it is created with. */
  content: string;
}

/**
 * The pages the portal cannot be without.
 *
 * Two, and the list is meant to stay that short. Anything a reader can reach
 * from somewhere else is an ordinary editorial page and belongs in the
 * dashboard rather than here.
 */
export const PORTAL_PAGE_SEEDS: readonly PortalPageSeed[] = [
  { slug: "docs", title: "Documentation", path: "/docs", content: DOCS_PAGE_CONTENT },
  {
    slug: "pricing",
    title: "Honest and upfront pricing",
    path: "/pricing",
    content: PRICING_PAGE_CONTENT,
  },
];

/**
 * Creates any portal page that does not exist yet.
 *
 * @returns The slugs actually created, so a caller can report what it did.
 *
 * @remarks
 * Run once as the backend starts. A page that already exists is left exactly as
 * it is, including one somebody has edited beyond recognition, because this
 * knows what a page started as and never what it should say now.
 */
export async function ensurePortalPagesExist(): Promise<string[]> {
  const repository = await getAdminRepository();
  const created: string[] = [];

  for (const seed of PORTAL_PAGE_SEEDS) {
    // By slug rather than by published path: a page somebody has taken back to
    // draft still exists, and creating it again would collide on the slug. What
    // this asks is whether the page is there at all.
    const existing = await repository.getContentPageBySlug(seed.slug);
    if (existing) continue;

    await repository.createContentPage({
      slug: seed.slug,
      title: seed.title,
      status: "published",
      contextMask: ContentContext.DeveloperPortal,
      publications: [
        {
          context: ContentContext.DeveloperPortal,
          path: seed.path,
          status: "published",
          templateKey: PORTAL_TEMPLATE_KEY,
        },
      ],
      // Nobody, because nobody wrote it: the page is created by the portal so
      // the path answers, and the dashboard shows an author only once somebody
      // has actually edited it.
      createdBy: null,
    });
    // The body is set separately, because creating a page and writing its
    // content are two operations everywhere else too.
    await repository.updateContentPageBody(seed.slug, seed.content, null);
    created.push(seed.slug);
  }

  return created;
}
