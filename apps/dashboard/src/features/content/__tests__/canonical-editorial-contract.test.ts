import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const CONTENT_ROOT = resolve(process.cwd(), "src/features/content");

function productionSources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) {
      return entry.name === "__tests__" ? [] : productionSources(path);
    }
    return entry.isFile() && /\.[jt]sx?$/.test(entry.name) && !entry.name.endsWith(".test.tsx") ? [path] : [];
  });
}

describe("canonical editorial Dashboard contract", () => {
  it("contains no translation UI, locale state, or translation save branches", () => {
    const files = productionSources(CONTENT_ROOT);
    const names = files.map((path) => path.slice(CONTENT_ROOT.length + 1));

    expect(names).not.toContain("pages/LanguageTabs.tsx");
    expect(names).not.toContain("pages/usePageTranslations.ts");
    expect(names).not.toContain("pageLocalization.ts");
    expect(names).not.toContain("state/slices/translationsSlice.ts");

    const source = files.map((path) => readFileSync(path, "utf8")).join("\n");
    for (const forbidden of [
      "DEFAULT_LOCALE",
      "LOCALES",
      "LocalizedText",
      "TranslationStatus",
      "pageTranslations",
      "segment-translations",
      "translationsSlice",
      "useDeleteTranslation",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });
});
