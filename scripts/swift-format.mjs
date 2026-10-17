#!/usr/bin/env node
/**
 * Checks native Swift formatting, or applies it through Xcode's MCP tools.
 * The selected Xcode build is the formatter-version pin; never edit Swift files directly.
 */
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const configuration = resolve(root, ".swift-format");

/** Rejects a different compiler distribution before it can produce a divergent formatting baseline. */
function verifyToolchain() {
    const expected = readFileSync(resolve(root, ".xcode-build-version"), "utf8").trim();
    const actual = execFileSync("xcodebuild", ["-version"], { encoding: "utf8" });
    if (!actual.includes(`Build version ${expected}\n`)) {
        throw new Error(`Swift formatting requires Xcode build ${expected}. Select the version in .xcode-version.`);
    }
}

/** JSON-RPC transport for the Xcode bridge; it owns and closes only its own helper process. */
class XcodeTools {
    process;
    pending = new Map();
    nextID = 0;

    /** Opens a headless bridge session without running the application or its previews. */
    constructor() {
        this.process = spawn("xcrun", ["mcpbridge"], {
            env: { ...process.env, MCP_XCODE_SESSION_ID: randomUUID() },
            stdio: ["pipe", "pipe", "inherit"],
        });
        createInterface({ input: this.process.stdout }).on("line", (line) => {
            const message = JSON.parse(line);
            const pending = this.pending.get(message.id);
            if (!pending) return;
            clearTimeout(pending.timer);
            this.pending.delete(message.id);
            if (message.error || message.result?.isError) pending.reject(new Error(JSON.stringify(message)));
            else pending.resolve(message.result);
        });
        this.process.on("exit", () => {
            for (const pending of this.pending.values()) {
                clearTimeout(pending.timer);
                pending.reject(new Error("Xcode bridge disconnected"));
            }
            this.pending.clear();
        });
    }

    /** Sends one request and bounds the wait so a disconnected editor cannot hang a gate. */
    request(method, params) {
        const id = ++this.nextID;
        return new Promise((resolveRequest, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error(`Xcode request timed out: ${method}`));
            }, 120_000);
            this.pending.set(id, { resolve: resolveRequest, reject, timer });
            this.process.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
        });
    }

    /** Returns a tool's structured payload and treats reported native-tool errors as failures. */
    async call(name, args) {
        const result = await this.request("tools/call", { name, arguments: args });
        return result.structuredContent ?? JSON.parse(result.content.find((entry) => entry.type === "text").text);
    }

    /** Stops the transport created by this instance, never Xcode or the user's app. */
    close() {
        this.process.kill();
    }
}

/** Formats the complete project through XcodeRead and XcodeWrite, preserving project membership. */
async function applyUsingXcode() {
    const tools = new XcodeTools();
    try {
        await tools.request("initialize", {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "musiccloud-swift-format", version: "1" },
        });
        tools.process.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
        const workspace = await tools.call("XcodeOpenWorkspace", {
            path: resolve(root, "apps/Apple/musiccloud.xcodeproj"),
        });
        const workspaceIdentifier = workspace.workspaceIdentifier;
        const matches = new Set();
        for (const character of "abcdefghijklmnopqrstuvwxyz") {
            const pattern = `**/[${character}${character.toUpperCase()}]*.swift`;
            const files = await tools.call("XcodeGlob", { workspaceIdentifier, pattern });
            if (files.truncated) throw new Error(`Xcode returned an incomplete Swift file list: ${pattern}`);
            for (const file of files.matches) matches.add(file);
        }
        let changed = 0;
        for (const filePath of matches) {
            const file = await tools.call("XcodeRead", { workspaceIdentifier, filePath, limit: 10000 });
            if (file.linesRead < file.totalLines) throw new Error(`Incomplete source read: ${filePath}`);
            const original = file.content.replace(/^\s*\d+\t/gm, "");
            const formatted = execFileSync("xcrun", ["swift-format", "format", "--configuration", configuration, "-"], {
                input: original,
                encoding: "utf8",
                maxBuffer: 16 * 1024 * 1024,
            });
            const repeated = execFileSync("xcrun", ["swift-format", "format", "--configuration", configuration, "-"], {
                input: formatted, encoding: "utf8", maxBuffer: 16 * 1024 * 1024,
            });
            if (repeated !== formatted) throw new Error(`Formatter output is not idempotent: ${filePath}`);
            execFileSync("xcrun", ["swiftc", "-frontend", "-parse", "-enable-bare-slash-regex", "-"], { input: formatted, stdio: ["pipe", "ignore", "pipe"] });
            if (original === formatted) continue;
            await tools.call("XcodeWrite", { workspaceIdentifier, filePath, content: formatted });
            changed++;
        }
        console.log(`Formatted ${changed} of ${matches.size} Swift files through Xcode tools.`);
    } finally {
        tools.close();
    }
}

/** Reads Xcode's source-membership graph using Apple's plist reader, without changing the project. */
function projectSources() {
    const projectRoot = resolve(root, "apps/Apple");
    const project = JSON.parse(execFileSync("plutil", ["-convert", "json", "-o", "-", resolve(projectRoot, "musiccloud.xcodeproj/project.pbxproj")], { encoding: "utf8" }));
    const objects = project.objects;
    const references = new Set();
    for (const object of Object.values(objects)) {
        if (object.isa === "PBXFileSystemSynchronizedRootGroup") throw new Error("Update source discovery for synchronized Xcode groups");
        if (object.isa === "PBXSourcesBuildPhase") {
            for (const id of object.files) references.add(objects[id].fileRef);
        }
    }
    const paths = new Map();
    /** Resolves group-relative file references in the canonical project graph. */
    function visit(id, parent) {
        const object = objects[id];
        if (!object) return;
        const base = object.sourceTree === "SOURCE_ROOT" ? projectRoot : parent;
        const path = object.path ? resolve(base, object.path) : base;
        if (object.isa === "PBXFileReference" && references.has(id) && path.endsWith(".swift")) paths.set(id, path);
        for (const child of object.children ?? []) visit(child, path);
    }
    visit(objects[project.rootObject].mainGroup, projectRoot);
    if (!paths.size) throw new Error("No native Swift source membership found");
    return [...new Set(paths.values())].sort();
}

/** Runs the non-mutating gate over compiled project sources, not abandoned files outside target membership. */
function check() {
    execFileSync("xcrun", ["swift-format", "lint", "--strict", "--configuration", configuration, ...projectSources()], { stdio: "inherit" });
}

try {
    verifyToolchain();
    if (process.argv.includes("--write")) await applyUsingXcode();
    else if (process.argv.length > 2) throw new Error("Usage: node scripts/swift-format.mjs [--write]");
    else check();
} catch (error) {
    console.error(error.message);
    process.exitCode = 1;
}
