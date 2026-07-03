/**
 * @file Client-side JSON file download helper (ported from lmaa.space):
 * serialises a value and triggers a browser download via a transient object
 * URL — used by the form builder's export actions.
 */

/**
 * Downloads `data` as a pretty-printed JSON file.
 *
 * @param filename - The suggested file name (e.g. `"contact.json"`).
 * @param data - Any JSON-serialisable value.
 */
export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
