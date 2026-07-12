/**
 * Normalized outside-in hierarchy for generated API-reference content.
 *
 * Chapters own content H2 structure and icon alignment. Entries own the
 * repeated external H3 plus content relationship used by endpoints, SDKs, and
 * schemas. Call sites supply data and search attributes without rebuilding
 * either layout.
 */
import { createCompoundElement } from "@/components/compoundElement";

const ApiContentRoot = createCompoundElement("div", "api-reference-content api-content");
const ApiContentChapter = createCompoundElement("section", "api-content__chapter");
const ApiContentChapterHeader = createCompoundElement("h2", "api-content__chapter-header");
const ApiContentChapterHeaderIcon = createCompoundElement("span", "api-content__chapter-header-icon");
const ApiContentChapterHeaderTitle = createCompoundElement("span", "api-content__chapter-header-title");
const ApiContentChapterBody = createCompoundElement("div", "api-content__chapter-body");
const ApiContentEntry = createCompoundElement("div", "api-content__entry");
const ApiContentEntryTitle = createCompoundElement("h3", "api-content__entry-title");
const ApiContentEntryContent = createCompoundElement("div", "api-content__entry-content");

/** Compound hierarchy used by every generated API-reference chapter and entry. */
export const ApiContent = Object.assign(ApiContentRoot, {
  Chapter: Object.assign(ApiContentChapter, {
    Header: Object.assign(ApiContentChapterHeader, {
      Icon: ApiContentChapterHeaderIcon,
      Title: ApiContentChapterHeaderTitle,
    }),
    Body: ApiContentChapterBody,
  }),
  Entry: Object.assign(ApiContentEntry, {
    Title: ApiContentEntryTitle,
    Content: ApiContentEntryContent,
  }),
});
