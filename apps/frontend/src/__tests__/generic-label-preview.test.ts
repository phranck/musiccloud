import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const previewPath = path.resolve(process.cwd(), "public/generic-label-preview.html");

describe("generic vinyl label preview", () => {
  it("installs the Vite React preamble before importing the TSX record component", async () => {
    const preview = await readFile(previewPath, "utf8");
    const preambleIndex = preview.indexOf('import RefreshRuntime from "/@react-refresh";');
    const recordImportIndex = preview.indexOf('import { VinylRecord } from "/src/components/vinyl/VinylRecord.tsx";');

    expect(preambleIndex).toBeGreaterThanOrEqual(0);
    expect(preview).toContain("window.__vite_plugin_react_preamble_installed__ = true;");
    expect(preambleIndex).toBeLessThan(recordImportIndex);
    expect(preview.slice(preambleIndex, recordImportIndex)).toContain("</script>");
  });
});
