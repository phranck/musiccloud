import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const configuration = fileURLToPath(new URL("../../.swift-format", import.meta.url));

/** Formats an isolated Swift fragment without writing a source file or launching an application. */
function format(source) {
    return execFileSync("xcrun", ["swift-format", "format", "--configuration", configuration, "-"], {
        input: source,
        encoding: "utf8",
    });
}

/** Builds a two-argument expression at an exact physical line length. */
function boundaryCall(length) {
    const prefix = 'let value = construct(first: "';
    const suffix = '", second: "b")';
    return `${prefix}${"x".repeat(length - prefix.length - suffix.length)}${suffix}\n`;
}

test("short argument lists collapse to a single line", () => {
    assert.equal(format("let value = construct(\n    first: 1,\n    second: 2\n)\n"), "let value = construct(first: 1, second: 2)\n");
});

test("a 140-character call remains on one line", () => {
    const source = boundaryCall(140);
    assert.equal(source.trimEnd().length, 140);
    assert.equal(format(source), source);
});

test("a 141-character call breaks after the opening parenthesis with one argument per line", () => {
    const output = format(boundaryCall(141));
    assert.match(output, /^let value = construct\(\n    first:/);
    assert.match(output, /,\n    second: "b"\n\)\n$/);
});

test("long initializer declarations use one parameter per line", () => {
    const output = format("struct Example { init(settings: AutoPostSettings, defaultTemplates: DefaultTemplates, accountStore: SocialAccountStore, templateStore: PersistentPostTemplateStore) {} }\n");
    assert.match(output, /init\(\n        settings: AutoPostSettings,\n        defaultTemplates: DefaultTemplates,\n        accountStore: SocialAccountStore,\n        templateStore: PersistentPostTemplateStore\n    \)/);
});

test("the reported automatic-posting call uses a vertical argument list", () => {
    const output = format("let plan = AutoPostPlan.make(context: context, accounts: SocialAccount.all(in: accountStore), templates: templateStore.allTemplates, settings: settings, defaultTemplates: defaultTemplates)\n");
    assert.match(output, /^let plan = AutoPostPlan.make\(\n    context: context,\n    accounts:/);
    assert.match(output, /\n    templates: templateStore.allTemplates,\n    settings: settings,\n    defaultTemplates: defaultTemplates\n\)\n$/);
});

test("short initializer parameter lists stay on one line", () => {
    assert.match(format("struct Example { init(first: Int, second: String) {} }\n"), /init\(first: Int, second: String\)/);
});

test("complete platform-specific expressions preserve directive boundaries", () => {
    const output = format("func value() -> Int {\n#if os(macOS)\nlet result = compute(first: 1, second: 2)\n#else\nlet result = compute(first: 3, second: 4)\n#endif\nreturn result\n}\n");
    assert.match(output, /\n    #else\n/);
    assert.match(output, /\n    #endif\n/);
    assert.equal(format(output), output);
});

test("formatting is idempotent and preserves unindented platform blocks", () => {
    const once = format(`#if os(macOS)\n${boundaryCall(141)}#endif\n`);
    assert.match(once, /^#if os\(macOS\)\nlet value/);
    assert.equal(format(once), once);
});
