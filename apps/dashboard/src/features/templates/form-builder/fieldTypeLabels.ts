/**
 * @file Field-type label lookup for the form builder (MC-083). Lives apart
 * from the components (project rule: no logic exports in component files);
 * shared by the field config panel's header and the edit page.
 */

import type { FieldType } from "@musiccloud/shared";

/**
 * Resolves the localised label for a field type from the `fieldTypes` i18n
 * block. `FieldType` uses kebab-case (`"multi-select"`) while i18n keys use
 * camelCase (`multiSelect`), so the key is converted before lookup; unknown
 * types fall back to the raw type string.
 *
 * @param type - The field type to label.
 * @param fieldTypeMessages - The `messages.formBuilder.fieldTypes` block.
 */
export function fieldTypeLabel(type: FieldType, fieldTypeMessages: Record<string, string>): string {
  const key = type.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
  return fieldTypeMessages[key] ?? fieldTypeMessages[type] ?? type;
}
