/** Syntax-aware guard layout. Source positions come from Apple's SwiftSyntax, never a Swift-code regex. */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

// Host-only parser compiled from stdin. It is not application source and never writes Swift files.
const parserSource = String.raw`
import Foundation
import SwiftParser
import SwiftSyntax

/// A whitespace boundary identified by the parser, expressed as UTF-8 byte offsets.
struct Boundary: Codable {
    let start: Int
    let end: Int
    let layout: String
}

/// Visits real guard statements, including nested statements and inactive platform branches.
final class GuardBoundaries: SyntaxVisitor {
    var boundaries: [Boundary] = []

    /// Records only token-to-token trivia; expressions, literals, and patterns remain untouched.
    func gap(_ left: TokenSyntax?, _ right: TokenSyntax?, layout: String) {
        guard
            let left,
            let right
        else {
            return
        }
        let start = left.endPositionBeforeTrailingTrivia.utf8Offset
        let end = right.positionAfterSkippingLeadingTrivia.utf8Offset
        guard start <= end
        else {
            return
        }
        boundaries.append(Boundary(start: start, end: end, layout: layout))
    }

    /// Lays out a guard's condition list and its exit block without interpreting its expressions.
    override func visit(_ node: GuardStmtSyntax) -> SyntaxVisitorContinueKind {
        let conditions = Array(node.conditions)
        guard
            let first = conditions.first,
            let last = conditions.last
        else {
            return .visitChildren
        }
        gap(node.guardKeyword.previousToken(viewMode: .sourceAccurate), node.guardKeyword, layout: "line")
        gap(node.guardKeyword, first.firstToken(viewMode: .sourceAccurate), layout: conditions.count > 1 ? "line" : "space")
        for index in conditions.indices.dropLast() {
            gap(conditions[index].trailingComma, conditions[index + 1].firstToken(viewMode: .sourceAccurate), layout: "line")
        }
        gap(last.lastToken(viewMode: .sourceAccurate), node.elseKeyword, layout: "line")
        gap(node.elseKeyword, node.body.leftBrace, layout: "space")
        let statements = Array(node.body.statements)
        if let first = statements.first, let last = statements.last {
            gap(node.body.leftBrace, first.firstToken(viewMode: .sourceAccurate), layout: "line")
            for index in statements.indices.dropLast() {
                gap(
                    statements[index].lastToken(viewMode: .sourceAccurate),
                    statements[index + 1].firstToken(viewMode: .sourceAccurate),
                    layout: "line"
                )
            }
            gap(last.lastToken(viewMode: .sourceAccurate), node.body.rightBrace, layout: "line")
        }
        gap(node.body.rightBrace, node.body.rightBrace.nextToken(viewMode: .sourceAccurate), layout: "line")
        return .visitChildren
    }
}

let input = FileHandle.standardInput.readDataToEndOfFile()
let source = String(decoding: input, as: UTF8.self)
let tree = Parser.parse(source: source)
let visitor = GuardBoundaries(viewMode: .sourceAccurate)
visitor.walk(tree)
FileHandle.standardOutput.write(try JSONEncoder().encode(visitor.boundaries))
`;

/** Builds the host parser once per source/compiler revision, without adding a project target or dependency. */
function parserBinary() {
    const developer = execFileSync("xcode-select", ["-p"], { encoding: "utf8" }).trim();
    const selected = process.env.DEVELOPER_DIR ?? developer;
    const host = resolve(selected, "Toolchains/XcodeDefault.xctoolchain/usr/lib/swift/host");
    const revision = readFileSync(resolve(root, ".xcode-build-version"), "utf8").trim();
    const digest = createHash("sha256").update(parserSource + revision).digest("hex").slice(0, 16);
    const folder = resolve(root, ".tmp/swift-format-guards", digest);
    const binary = resolve(folder, "guard-layout");
    if (!existsSync(binary)) {
        mkdirSync(folder, { recursive: true });
        execFileSync("xcrun", ["swiftc", "-I", host, "-L", host, "-lSwiftSyntax", "-lSwiftParser", "-Xlinker", "-rpath", "-Xlinker", host, "-o", binary, "-"], {
            input: parserSource, encoding: "utf8", maxBuffer: 16 * 1024 * 1024,
        });
    }
    return binary;
}

let cachedParser;
let checkedFormatter = false;

/** Expands guard whitespace while retaining comments and all non-trivia source bytes. */
export function formatGuards(source) {
    cachedParser ??= parserBinary();
    const boundaries = JSON.parse(execFileSync(cachedParser, { input: source, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }));
    let bytes = Buffer.from(source);
    const unique = new Map(boundaries.map((boundary) => [`${boundary.start}:${boundary.end}`, boundary]));
    for (const { start, end, layout } of [...unique.values()].sort((a, b) => b.start - a.start)) {
        const original = bytes.subarray(start, end).toString();
        const spacing = layout === "line" ? "\n" : " ";
        // These are parser-identified trivia gaps, not expressions or string contents.
        const replacement = original.trim() ? original.replace(/^\s*/, spacing).replace(/\s*$/, "\n") : spacing;
        bytes = Buffer.concat([bytes.subarray(0, start), Buffer.from(replacement), bytes.subarray(end)]);
    }
    const version = readFileSync(resolve(root, ".swiftformat-version"), "utf8").trim();
    const formatter = resolve(root, ".tmp/swiftformat", version, "swiftformat");
    if (!checkedFormatter) {
        const actual = execFileSync(formatter, ["--version"], { encoding: "utf8" }).trim();
        if (actual !== version) throw new Error(`Expected SwiftFormat ${version}, got ${actual}`);
        checkedFormatter = true;
    }
    const layout = JSON.parse(readFileSync(resolve(root, ".swift-format"), "utf8"));
    const indentation = layout.indentation.tabs ? "tab" : String(layout.indentation.spaces);
    const conditionalIndentation = layout.indentConditionalCompilationBlocks ? "indent" : "no-indent";
    return execFileSync(formatter, ["stdin", "--fragment", "true", "--rules", "indent,trailingSpace", "--indent", indentation, "--ifdef", conditionalIndentation, "--quiet"], {
        input: bytes, encoding: "utf8", maxBuffer: 16 * 1024 * 1024,
    });
}
