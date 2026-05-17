import type { PagesBulkPagesEntry, PagesBulkRequest } from "@musiccloud/shared";
import type { ContentState } from "./slices/contentSlice";
import { dirtySlugs as dirtyContentSlugs } from "./slices/contentSlice";
import type { MetaState } from "./slices/metaSlice";
import { dirtySlugs as dirtyMetaSlugs } from "./slices/metaSlice";
import type { SegmentsState } from "./slices/segmentsSlice";
import { dirtyOwners, toBulkSegmentsInput } from "./slices/segmentsSlice";
import type { SidebarState } from "./slices/sidebarSlice";
import { isDirty as sidebarDirty } from "./slices/sidebarSlice";
import type { TranslationsState } from "./slices/translationsSlice";

export interface SliceBundle {
  meta: MetaState;
  content: ContentState;
  segments: SegmentsState;
  translations: TranslationsState;
  sidebar: SidebarState;
}

type MetaDiff = NonNullable<PagesBulkPagesEntry["meta"]>;

export function buildBulkPayload(b: SliceBundle): PagesBulkRequest {
  const out: PagesBulkRequest = {};

  const dirtyMeta = new Set(dirtyMetaSlugs(b.meta));
  const dirtyContent = new Set(dirtyContentSlugs(b.content));
  const allPageSlugs = new Set<string>([...dirtyMeta, ...dirtyContent]);
  if (allPageSlugs.size > 0) {
    out.pages = [];
    for (const slug of allPageSlugs) {
      const entry: PagesBulkPagesEntry = { slug };
      if (dirtyMeta.has(slug)) {
        const e = b.meta.pages[slug];
        const diff: Record<string, unknown> = {};
        for (const k of Object.keys(e.current) as Array<keyof typeof e.current>) {
          if (e.current[k] !== e.initial[k]) diff[k] = e.current[k];
        }
        entry.meta = diff as MetaDiff;
      }
      if (dirtyContent.has(slug)) {
        entry.content = b.content.pages[slug].current;
      }
      out.pages.push(entry);
    }
  }

  const dirtySeg = dirtyOwners(b.segments);
  if (dirtySeg.length > 0) {
    out.segments = dirtySeg.map((owner) => ({
      ownerSlug: owner,
      segments: toBulkSegmentsInput(b.segments.byOwner[owner].current),
    }));
  }

  // translations
  const trEntries: NonNullable<PagesBulkRequest["pageTranslations"]> = [];
  for (const [slug, locales] of Object.entries(b.translations.byPage)) {
    for (const [locale, v] of Object.entries(locales)) {
      if (v.initial.title !== v.current.title || v.initial.content !== v.current.content) {
        trEntries.push({ slug, locale: locale as never, ...v.current });
      }
    }
  }
  if (trEntries.length > 0) out.pageTranslations = trEntries;

  if (sidebarDirty(b.sidebar)) out.topLevelOrder = b.sidebar.current;

  return out;
}
