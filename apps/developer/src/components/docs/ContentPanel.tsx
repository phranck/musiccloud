/**
 * Shared inner-surface compound for content nested inside a ContentCard.
 *
 * The panel owns the derived radius and border recipe. Domain compounds add
 * semantics and tone while reusing these structural slots, which keeps nested
 * cards, integration facts, and code frames geometrically consistent.
 */
import { createCompoundElement } from "@/components/compoundElement";

const ContentPanelRoot = createCompoundElement("div", "content-panel");
const ContentPanelHeader = createCompoundElement("div", "content-panel__header");
const ContentPanelHeaderTitle = createCompoundElement("h3", "content-panel__header-title");
const ContentPanelLeading = createCompoundElement("div", "content-panel__leading");
const ContentPanelContent = createCompoundElement("div", "content-panel__content");
const ContentPanelMeta = createCompoundElement("div", "content-panel__meta");
const ContentPanelFooter = createCompoundElement("div", "content-panel__footer");

/** Compound inner panel shared by API-reference domain cards. */
export const ContentPanel = Object.assign(ContentPanelRoot, {
  Header: Object.assign(ContentPanelHeader, {
    Title: ContentPanelHeaderTitle,
  }),
  Leading: ContentPanelLeading,
  Content: ContentPanelContent,
  Meta: ContentPanelMeta,
  Footer: ContentPanelFooter,
});
