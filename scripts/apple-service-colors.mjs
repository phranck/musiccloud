#!/usr/bin/env node
/** Generates native color assets from the shared platform metadata instead of maintaining a second brand palette. */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const assets = resolve(root, "apps/Apple/App/Supporting Files/Assets.xcassets");

/** Reads the literal platform palette through TypeScript's parser without executing application modules. */
export function platformColors() {
    const path = resolve(root, "packages/shared/src/platform.ts");
    const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
    let initializer;
    /** Finds the canonical declaration rather than matching source text. */
    function visit(node) {
        if (ts.isVariableDeclaration(node) && node.name.getText(source) === "PLATFORM_CONFIG") initializer = node.initializer;
        ts.forEachChild(node, visit);
    }
    visit(source);
    if (!initializer || !ts.isObjectLiteralExpression(initializer)) throw new Error("Expected a literal PLATFORM_CONFIG");
    return new Map(initializer.properties.map((property) => {
        if (!ts.isPropertyAssignment(property) || !ts.isObjectLiteralExpression(property.initializer)) throw new Error("Unsupported platform metadata");
        const color = property.initializer.properties.find((entry) => entry.name?.getText(source) === "color");
        if (!color || !ts.isStringLiteral(color.initializer)) throw new Error("Expected a literal brand color");
        return [property.name.text, color.initializer.text];
    }));
}

/** Produces the Xcode sRGB color-set representation for a canonical hexadecimal color. */
function colorSet(hex) {
    if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error(`Invalid brand color: ${hex}`);
    return {
        colors: [{ idiom: "universal", color: { "color-space": "srgb", components: {
            red: `0x${hex.slice(1, 3)}`, green: `0x${hex.slice(3, 5)}`, blue: `0x${hex.slice(5, 7)}`, alpha: "1.000",
        } } }],
        info: { author: "xcode", version: 1 },
    };
}

/** Writes or checks only color sets for brand marks already bundled with the native application. */
export function synchronizeColors(write = false) {
    const colors = platformColors();
    const target = resolve(assets, "ServiceColors");
    const names = readdirSync(resolve(assets, "ServiceIcons"))
        .filter((name) => name.endsWith(".imageset"))
        .map((name) => name.slice(0, -9)).filter((name) => colors.has(name));
    const entries = [[resolve(target, "Contents.json"), { info: { author: "xcode", version: 1 }, properties: { "provides-namespace": true } }],
        ...names.map((name) => [resolve(target, `${name}.colorset/Contents.json`), colorSet(colors.get(name))])];
    for (const [path, expected] of entries) {
        if (write) {
            mkdirSync(dirname(path), { recursive: true });
            writeFileSync(path, `${JSON.stringify(expected, null, 2)}\n`);
        } else if (JSON.stringify(JSON.parse(readFileSync(path, "utf8"))) !== JSON.stringify(expected)) {
            throw new Error(`Native brand palette drift: ${path}`);
        }
    }
    return names.length;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    console.log(`Verified ${synchronizeColors(process.argv.includes("--write"))} native brand colors.`);
}
