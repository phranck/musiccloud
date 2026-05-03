import type { ContentPageSummary } from "@musiccloud/shared";

export interface SegmentedBlock {
  parent: ContentPageSummary;
  children: ContentPageSummary[];
}

export interface PagesHierarchy {
  segmentedBlocks: SegmentedBlock[];
  orphanDefaults: ContentPageSummary[];
}

/**
 * Build the segmented-parent / orphan-default split of a page list.
 *
 * Children are sorted by `position`; once a default page is claimed by a
 * segmented parent it is excluded from later parents and from the orphan
 * bucket. Sidebar and PagesListPage share this grouping.
 */
export function groupPagesByHierarchy(pages: ContentPageSummary[]): PagesHierarchy {
  const bySlug = new Map(pages.map((p) => [p.slug, p]));
  const claimed = new Set<string>();
  const segmentedBlocks: SegmentedBlock[] = pages
    .filter((p) => p.pageType === "segmented")
    .map((parent) => {
      const children = (parent.segments ?? [])
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((seg) => bySlug.get(seg.targetSlug))
        .filter((p): p is ContentPageSummary => p !== undefined && !claimed.has(p.slug));
      for (const c of children) claimed.add(c.slug);
      return { parent, children };
    });
  const orphanDefaults = pages.filter((p) => p.pageType === "default" && !claimed.has(p.slug));
  return { segmentedBlocks, orphanDefaults };
}
