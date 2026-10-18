/** One canonical formatting pipeline shared by writes, checks, and regression fixtures. */
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { formatGuards } from "./guard-layout.mjs";

const configuration = fileURLToPath(new URL("../../.swift-format", import.meta.url));

/** Keeps canonical 140-column argument lists, then applies syntax-aware guard layout and indentation. */
export function formatSource(source) {
    const canonical = execFileSync("xcrun", ["swift-format", "format", "--configuration", configuration, "-"], {
        input: source, encoding: "utf8", maxBuffer: 16 * 1024 * 1024,
    });
    return formatGuards(canonical);
}
