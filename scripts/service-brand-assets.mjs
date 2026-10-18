import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const sourceDirectory = "assets/service-brands";
const appleDirectory = "apps/Apple/App/Supporting Files/Assets.xcassets/ServiceBrandIcons";
const webDirectories = ["apps/frontend/public/icons/service-brands", "apps/dashboard/public/icons/service-brands"];

/**
 * Reads identifier names from the existing Service namespace without duplicating its map.
 * @param {string} root Repository root containing the shared namespace.
 * @returns {Map<string, string>} Service values mapped to their exported constant names.
 */
function serviceNames(root) {
  const file = path.join(root, "packages/shared/src/services.ts");
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  const declaration = source.statements.filter(ts.isVariableStatement)
    .flatMap((statement) => [...statement.declarationList.declarations])
    .find((entry) => ts.isIdentifier(entry.name) && entry.name.text === "Service");
  assert.ok(declaration?.initializer, "The shared Service namespace must exist");
  let value = declaration.initializer;
  while (ts.isAsExpression(value) || ts.isSatisfiesExpression(value)) value = value.expression;
  assert.ok(ts.isObjectLiteralExpression(value), "Service must remain an explicit identifier namespace");
  return new Map(value.properties.map((property) => {
    assert.ok(ts.isPropertyAssignment(property) && ts.isIdentifier(property.name) && ts.isStringLiteral(property.initializer));
    return [property.initializer.text, property.name.text];
  }));
}

/**
 * Lists files in one generated subtree and refuses symlink traversal.
 * @param {string} directory Owned generated directory, never an arbitrary public directory.
 * @returns {string[]} Absolute paths of regular generated files.
 */
function generatedFiles(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    assert.ok(!entry.isSymbolicLink(), `Generated artwork cannot contain symlinks: ${file}`);
    return entry.isDirectory() ? generatedFiles(file) : [file];
  });
}

/**
 * Constructs all platform artifacts from curated bytes and their provenance.
 * @param {string} root Repository root; fixtures supply a private temporary root.
 * @returns {{outputs: Map<string, Buffer>, owned: string[]}} Complete expected outputs and bounded generated subtrees.
 */
function expectedOutputs(root) {
  const sourceRoot = realpathSync(path.join(root, sourceDirectory));
  const manifest = JSON.parse(readFileSync(path.join(sourceRoot, "manifest.json"), "utf8"));
  assert.equal(manifest.schemaVersion, 1, "Unsupported brand manifest schema");
  const names = serviceNames(root);
  assert.deepEqual(new Set(manifest.services.map((service) => service.id)), new Set(names.keys()),
    "The curated manifest must cover every shared Service exactly once");
  assert.equal(manifest.services.length, names.size, "Duplicate curated service identifiers");
  const outputs = new Map();
  const records = [];
  const originals = [];
  const glyphs = [];
  const json = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
  const add = (relative, bytes) => outputs.set(path.join(root, relative), bytes);
  const info = { author: "xcode", version: 1 };
  add(`${appleDirectory}/Contents.json`, json({ info, properties: { "provides-namespace": true } }));

  for (const service of manifest.services) {
    assert.ok(/^[a-z][a-z0-9-]*$/.test(service.id), "Unsafe service asset identifier");
    assert.ok(service.variants.default && service.provenance, `Missing artwork or provenance: ${service.id}`);
    const variants = new Map();
    const filenames = new Map();
    for (const [variant, relative] of Object.entries(service.variants)) {
      assert.ok(["default", "dark", "glyph"].includes(variant), `Unknown artwork variant: ${variant}`);
      const candidate = path.resolve(sourceRoot, relative);
      assert.ok(candidate.startsWith(`${sourceRoot}${path.sep}`), "Curated artwork must stay inside its source directory");
      const file = realpathSync(candidate);
      assert.ok(file.startsWith(`${sourceRoot}${path.sep}`), "Curated artwork must stay inside its source directory");
      const extension = path.extname(file);
      assert.ok([".svg", ".png", ".jpeg", ".jpg"].includes(extension), "Unsupported artwork format");
      const bytes = readFileSync(file);
      const suffix = variant === "default" ? "" : `-${variant}`;
      const filename = filenames.get(file) ?? `${service.id}${suffix}${extension}`;
      filenames.set(file, filename);
      variants.set(variant, { bytes, filename, extension });
      for (const directory of webDirectories) add(`${directory}/${filename}`, bytes);
    }
    const original = variants.get(service.webVariant ?? "default");
    assert.ok(original, `Missing web appearance: ${service.id}`);
    originals.push(`  [Service.${names.get(service.id)}]: "service-brands/${original.filename}",`);
    if (variants.has("glyph")) glyphs.push(`  [Service.${names.get(service.id)}]: "service-brands/${variants.get("glyph").filename}",`);
    if (!service.apple) continue;
    const images = [];
    for (const variant of ["default", "dark"]) {
      const artwork = variants.get(variant);
      if (!artwork) continue;
      const filename = `icon${variant === "dark" ? "-dark" : ""}${artwork.extension}`;
      add(`${appleDirectory}/${service.id}.imageset/${filename}`, artwork.bytes);
      images.push({ filename, idiom: "universal", ...(variant === "dark"
        ? { appearances: [{ appearance: "luminosity", value: "dark" }] } : {}) });
    }
    add(`${appleDirectory}/${service.id}.imageset/Contents.json`, json({
      images, info, properties: { "template-rendering-intent": "original",
        ...(variants.get("default").extension === ".svg" ? { "preserves-vector-representation": true } : {}) },
    }));
    records.push({ service: service.id, ...service.provenance,
      bundledSHA256: createHash("sha256").update(variants.get("default").bytes).digest("hex") });
  }
  add("apps/Apple/BRAND_ASSETS.json", json({ generatedFrom: `${sourceDirectory}/manifest.json`,
    notice: manifest.notice, brandfetchTerms: manifest.brandfetchTerms, assets: records }));
  add("packages/dashboard-ui/src/platform-icon/platformIconFiles.ts", Buffer.from(
    `// Generated by scripts/service-brand-assets.mjs. Edit assets/service-brands/manifest.json instead.\n` +
    `import { Service, type ServiceId } from "@musiccloud/shared";\n\n` +
    `/** Original-color artwork served by every web consumer from its public icon directory. */\n` +
    `export const PLATFORM_ICON_FILES = {\n${originals.join("\n")}\n} as const satisfies Record<ServiceId, string>;\n\n` +
    `/** Optional transparent glyph variants that preserve text-color rendering without opaque tile masks. */\n` +
    `export const PLATFORM_ICON_GLYPH_FILES: Readonly<Partial<Record<ServiceId, string>>> = {\n${glyphs.join("\n")}\n};\n`,
  ));
  return { outputs, owned: [...webDirectories, appleDirectory].map((directory) => path.join(root, directory)) };
}

/**
 * Refuses output aliases before a generated file can overwrite unrelated data.
 * @param {string} file Physical repository path whose existing ancestor is checked.
 * @returns {void} Throws when a destination or one of its parents is a symlink.
 */
function rejectAliasedOutput(file) {
  let existing = file;
  while (!lstatSync(existing, { throwIfNoEntry: false })) existing = path.dirname(existing);
  assert.equal(realpathSync(existing), existing, "Generated outputs cannot traverse symlinks");
}

/**
 * Checks or writes the expected output and removes only stale files inside owned subtrees.
 * @param {string} root Repository root to validate or synchronize.
 * @param {boolean} write Whether to materialize changes rather than report drift.
 * @returns {string[]} Repository-relative paths with stale, missing or unexpected output.
 */
function synchronize(root, write) {
  const { outputs, owned } = expectedOutputs(root);
  for (const file of [...owned, ...outputs.keys()]) rejectAliasedOutput(file);
  const stale = owned.flatMap(generatedFiles).filter((file) => !outputs.has(file));
  const changed = [...outputs].filter(([file, bytes]) => !existsSync(file) || !readFileSync(file).equals(bytes));
  if (write) {
    for (const [file, bytes] of changed) {
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, bytes);
    }
    for (const file of stale) {
      unlinkSync(file);
      let directory = path.dirname(file);
      while (!owned.includes(directory) && readdirSync(directory).length === 0) {
        rmdirSync(directory);
        directory = path.dirname(directory);
      }
    }
  }
  return [...changed.map(([file]) => file), ...stale].map((file) => path.relative(root, file));
}

const args = process.argv.slice(2);
assert.ok(args.every((argument, index) => ["--check", "--write", "--root"].includes(argument) || args[index - 1] === "--root"),
  "Usage: node scripts/service-brand-assets.mjs [--check|--write] [--root directory]");
const rootIndex = args.indexOf("--root");
assert.ok(rootIndex < 0 || args[rootIndex + 1], "--root requires a directory");
const root = realpathSync(rootIndex < 0 ? projectRoot : path.resolve(args[rootIndex + 1]));
const write = args.includes("--write");
const changed = synchronize(root, write);
for (const file of changed) console.log(`${write ? "Generated" : "Out of date"}: ${file}`);
if (changed.length && !write) process.exitCode = 1;
else console.log(`Service-brand outputs ${write ? "synchronized" : "verified"}.`);
