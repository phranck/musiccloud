/**
 * The shared data table: one sortable, resizable table used by the admin
 * dashboard and by the developer portal.
 *
 * The component paints from a small set of design-system custom properties
 * rather than from either application's palette, so an application adopts it by
 * mapping those properties to its own tokens once. They are
 * `--ds-border`, `--ds-border-strong`, `--ds-danger-text`,
 * `--ds-section-body-bg` and `--ds-table-row-separator`, plus the
 * `.table-row-hover` rule for the hover surface.
 */
export * from "./DataTable.js";
export * from "./dataTableContext.js";
export * from "./useColumnWidths.js";
export * from "./useTableSort.js";
