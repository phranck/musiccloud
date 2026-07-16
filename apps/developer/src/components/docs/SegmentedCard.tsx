/**
 * Fully normalized card compound for one segmented selector and its panels.
 *
 * The component specializes the existing ContentCard and SegmentedControl
 * compounds. It does not own tab state or domain content: callers provide the
 * ARIA relationships and a controller provides selection behavior.
 *
 * Invariants:
 * - `Header.Segments` is the existing SegmentedControl surface.
 * - `Header.Segments.Item` and its Icon/Label slots are direct aliases of the
 *   shared SegmentedControl item compound.
 * - `Body.Panel` owns the native section used as a tabpanel.
 * - `Body.Panel.Stack` reuses ContentCard body flow geometry.
 */
import { createCompoundElement } from "@/components/compoundElement";
import { ContentCard } from "@/components/docs/ContentCard";
import { SegmentedControl } from "@/components/SegmentedControl";

const SegmentedCardRoot = createCompoundElement(ContentCard, "segmented-card");
const SegmentedCardHeader = createCompoundElement(ContentCard.Header, "segmented-card__header");
const SegmentedCardTitle = createCompoundElement(ContentCard.Header.Title, "segmented-card__title");
const SegmentedCardSegments = createCompoundElement(SegmentedControl, "segmented-card__segments");
const SegmentedCardBody = createCompoundElement(ContentCard.Body, "segmented-card__body", {
  "data-segmented-card-body": true,
});
const SegmentedCardPanel = createCompoundElement("section", "segmented-card__panel");
const SegmentedCardPanelStack = createCompoundElement(ContentCard.Body.Stack, "segmented-card__panel-stack");
const SegmentedCardFooter = createCompoundElement(ContentCard.Footer, "segmented-card__footer");

const SegmentedCardSegmentsCompound = Object.assign(SegmentedCardSegments, {
  Item: SegmentedControl.Item,
});
const SegmentedCardPanelCompound = Object.assign(SegmentedCardPanel, {
  Stack: SegmentedCardPanelStack,
});

/** Complete structural hierarchy for segmented content cards. */
export const SegmentedCard = Object.assign(SegmentedCardRoot, {
  Header: Object.assign(SegmentedCardHeader, {
    Title: SegmentedCardTitle,
    Segments: SegmentedCardSegmentsCompound,
  }),
  Body: Object.assign(SegmentedCardBody, {
    Panel: SegmentedCardPanelCompound,
  }),
  Footer: SegmentedCardFooter,
});
