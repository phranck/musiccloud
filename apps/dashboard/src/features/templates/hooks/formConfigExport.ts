/**
 * @file Form-config export serialisation (ported from lmaa.space): wraps a
 * form's payload in a versioned envelope and hands it to the JSON download
 * helper. The import route (`POST /api/admin/forms/import`) accepts the same
 * shape minus the envelope metadata.
 */

import { downloadJson } from "@/lib/downloadJson";
import type { FormConfig } from "@/shared/contracts";

/**
 * Downloads one form as `<name>.json`.
 *
 * @param name - The form's unique name (becomes the file name).
 * @param slug - The form's public slug.
 * @param rows - The form's field grid.
 * @param submissionConfig - The form's submission chain, if configured.
 */
export function exportFormConfigSingle(
  name: string,
  slug: string | undefined,
  rows: FormConfig["rows"],
  submissionConfig: FormConfig["submissionConfig"],
): void {
  downloadJson(`${name}.json`, {
    version: 1,
    exportedAt: new Date().toISOString(),
    name,
    slug,
    rows,
    submissionConfig,
  });
}
