import { lstat, readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const previewPath = path.resolve(process.cwd(), "public/generic-label-preview.html");
const mockupPath = path.resolve(process.cwd(), "../../mockups/generic-label-preview.html");

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

  it("shows the Generic Single at 45 RPM", async () => {
    const preview = await readFile(previewPath, "utf8");

    expect(preview).toContain(
      'import { VinylDiscFormat, VinylSpinState } from "/src/components/vinyl/VinylRecord.types.ts";',
    );
    expect(preview).toContain("spinState: rotationActive ? VinylSpinState.Playing : VinylSpinState.Idle,");
  });

  it("uses the Mockups preview as the single source for the public entry", async () => {
    const [preview, mockup, previewStats] = await Promise.all([
      readFile(previewPath, "utf8"),
      readFile(mockupPath, "utf8"),
      lstat(previewPath),
    ]);

    expect(previewStats.isSymbolicLink()).toBe(true);
    expect(preview).toBe(mockup);
  });

  it("offers format and rotation controls in the standalone preview", async () => {
    const preview = await readFile(previewPath, "utf8");

    expect(preview).toContain('data-vinyl-preview-format="lp"');
    expect(preview).toContain('data-vinyl-preview-format="single"');
    expect(preview).toContain('data-vinyl-preview-rotation="true"');
    expect(preview).toContain("discFormat: activeFormat,");
  });
});
