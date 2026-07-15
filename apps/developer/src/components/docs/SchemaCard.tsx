/**
 * Schema-specific documentation card for the API reference.
 *
 * Invariants:
 * - The outer surface always comes from ContentCard, so radius and spacing
 *   remain identical to endpoint, request, and response documentation.
 * - The full Header is a single expansion target, while Header.Addon owns the
 *   switch and chevron visual without creating a competing local layout.
 * - Field tables retain one semantic owner for headers, paths, metadata, and
 *   prose, so every generated schema keeps its columns aligned.
 */

import { createCompoundElement } from "@/components/compoundElement";
import { SchemaCardRoot } from "@/components/docs/SchemaCardRoot";

const SchemaCardHeader = createCompoundElement("header", "content-card__header schema-card__header");
const SchemaCardHeaderToggle = createCompoundElement("button", "schema-card__header-toggle");
const SchemaCardHeaderTitle = createCompoundElement("h3", "content-card__title schema-card__title");
const SchemaCardHeaderAddon = createCompoundElement("div", "content-card__header-addon schema-card__header-addon");
const SchemaCardHeaderChevron = createCompoundElement("span", "schema-card__header-chevron");
const SchemaCardBody = createCompoundElement("div", "content-card__body schema-card__body");
const SchemaCardDescription = createCompoundElement("div", "schema-card__description");
const SchemaCardPanel = createCompoundElement("div", "schema-card__panel");
const SchemaCardFieldTable = createCompoundElement("table", "schema-card__field-table");
const SchemaCardFieldTableHeader = createCompoundElement("thead", "schema-card__field-header");
const SchemaCardFieldTableHeaderRow = createCompoundElement("tr", "schema-card__field-header-row");
const SchemaCardFieldTableHeaderCell = createCompoundElement("th", "schema-card__field-heading");
const SchemaCardFieldTableBody = createCompoundElement("tbody", "schema-card__field-body");
const SchemaCardField = createCompoundElement("tr", "schema-card__field");
const SchemaCardFieldName = createCompoundElement("td", "schema-card__field-name");
const SchemaCardFieldValue = createCompoundElement("td", "schema-card__field-value");
const SchemaCardFieldValueType = createCompoundElement("code", "schema-card__field-value-type");
const SchemaCardFieldPresence = createCompoundElement("td", "schema-card__field-presence");
const SchemaCardFieldPresenceBadge = createCompoundElement("span", "schema-card__field-presence-badge");
const SchemaCardFieldDescription = createCompoundElement("td", "schema-card__field-description");
const SchemaCardVariants = createCompoundElement("div", "schema-card__variants");
const SchemaCardVariantsTitle = createCompoundElement("h4", "schema-card__variants-title");
const SchemaCardVariantsList = createCompoundElement("ul", "schema-card__variants-list");
const SchemaCardVariantsItem = createCompoundElement("li", "schema-card__variants-item");
const SchemaCardCollapsible = createCompoundElement("div", "schema-card__collapsible");
const SchemaCardCollapsibleContent = createCompoundElement("div", "schema-card__collapsible-content");

/**
 * Compound API for a schema's key documentation and raw JSON-schema views.
 * The static Astro caller owns state wiring, while this component owns every
 * reusable semantic and visual slot inside the card.
 */
export const SchemaCard = Object.assign(SchemaCardRoot, {
  Header: Object.assign(SchemaCardHeader, {
    Toggle: SchemaCardHeaderToggle,
    Title: SchemaCardHeaderTitle,
    Addon: SchemaCardHeaderAddon,
    Chevron: SchemaCardHeaderChevron,
  }),
  Body: Object.assign(SchemaCardBody, {
    Description: SchemaCardDescription,
    Panel: SchemaCardPanel,
    Fields: Object.assign(SchemaCardFieldTable, {
      Header: Object.assign(SchemaCardFieldTableHeader, {
        Row: SchemaCardFieldTableHeaderRow,
        Cell: SchemaCardFieldTableHeaderCell,
      }),
      Body: SchemaCardFieldTableBody,
      Field: Object.assign(SchemaCardField, {
        Name: SchemaCardFieldName,
        Value: Object.assign(SchemaCardFieldValue, {
          Type: SchemaCardFieldValueType,
        }),
        Presence: Object.assign(SchemaCardFieldPresence, {
          Badge: SchemaCardFieldPresenceBadge,
        }),
        Description: SchemaCardFieldDescription,
      }),
    }),
    Variants: Object.assign(SchemaCardVariants, {
      Title: SchemaCardVariantsTitle,
      List: Object.assign(SchemaCardVariantsList, {
        Item: SchemaCardVariantsItem,
      }),
    }),
  }),
  Collapsible: Object.assign(SchemaCardCollapsible, {
    Content: SchemaCardCollapsibleContent,
  }),
});
