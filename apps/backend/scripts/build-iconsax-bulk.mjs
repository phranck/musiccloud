// Writes the Iconsax Bulk icons next to the built backend bundle, so the icon
// shortcode can draw one on a developer portal page.
//
// The package ships React components rather than assets, one module per icon
// with a function per variant. Only the Bulk variant is taken, because that is
// the one the portal is drawn in, and only its paths: what a renderer needs is
// the shapes, not a component.
//
// The output is shaped exactly like the Phosphor assets beside it, so one
// reader serves both sets and the only thing that differs is which directory it
// looks in.
//
// Called from `tsup.config.ts` `onSuccess` (build) and from the dev script in
// `package.json` (watch mode).

import { mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = realpathSync(join(here, "..", "node_modules", "iconsax-react"));
const source = join(packageRoot, "dist", "esm");
const destination = join(here, "..", "dist", "icons", "iconsax-bulk");

/** The box every Iconsax icon is drawn in. */
const VIEW_BOX = "0 0 24 24";

/** One `React.createElement("path", { … })` inside a variant. */
const PATH_ELEMENT = /React\.createElement\("path",\s*\{([^}]*)\}/g;

/**
 * The name a writer uses, from the name the package files carry.
 *
 * `ProfileCircle` becomes `profile-circle` and `Book1` becomes `book-1`, which
 * is how every other icon in this codebase is named and what the Phosphor set
 * already publishes. A trailing digit is a word too: `book1` reads as a typo.
 *
 * @param {string} file - The module's base name.
 * @returns {string} The published name.
 */
function publishedName(file) {
  return file
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .replace(/([a-zA-Z])(\d)/g, "$1-$2")
    .toLowerCase();
}

/**
 * The Bulk variant's own block of one module.
 *
 * @param {string} text - The module's source.
 * @returns {string | null} The block, or `null` where the module has no Bulk.
 */
function bulkBlock(text) {
  const start = text.indexOf("var Bulk = function Bulk");
  if (start < 0) return null;
  const next = text.slice(start + 5).search(/\nvar [A-Z]/);
  return next < 0 ? text.slice(start) : text.slice(start, start + 5 + next);
}

/**
 * The shapes of one icon, as SVG.
 *
 * @param {string} block - The Bulk variant's block.
 * @returns {string | null} The `<path>` elements, or `null` where there are none.
 */
function shapesOf(block) {
  const shapes = [];
  for (const element of block.matchAll(PATH_ELEMENT)) {
    const body = element[1];
    const d = body.match(/\bd:\s*"([^"]*)"/)?.[1];
    if (!d) continue;
    const opacity = body.match(/\bopacity:\s*"([^"]*)"/)?.[1];
    shapes.push(`<path d="${d}"${opacity ? ` opacity="${opacity}"` : ""}/>`);
  }
  return shapes.length > 0 ? shapes.join("") : null;
}

rmSync(destination, { recursive: true, force: true });
mkdirSync(destination, { recursive: true });

let written = 0;
let skipped = 0;
for (const file of readdirSync(source)) {
  if (!file.endsWith(".js") || file.startsWith("_")) continue;

  const block = bulkBlock(readFileSync(join(source, file), "utf8"));
  const shapes = block && shapesOf(block);
  if (!shapes) {
    skipped += 1;
    continue;
  }

  writeFileSync(
    join(destination, `${publishedName(file.slice(0, -3))}.svg`),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VIEW_BOX}" fill="currentColor">${shapes}</svg>`,
  );
  written += 1;
}

if (written === 0) {
  console.error("[build-iconsax-bulk] no icon carried a Bulk variant, which cannot be right.");
  process.exit(1);
}

console.log(
  `[build-iconsax-bulk] wrote ${written} icons -> ${destination}${skipped ? ` (${skipped} without Bulk)` : ""}`,
);
