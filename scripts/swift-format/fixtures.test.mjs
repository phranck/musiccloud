import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { formatSource as format } from "./format-source.mjs";

/** Builds a two-argument expression at an exact physical line length. */
function boundaryCall(length) {
    const prefix = 'let value = construct(first: "';
    const suffix = '", second: "b")';
    return `${prefix}${"x".repeat(length - prefix.length - suffix.length)}${suffix}\n`;
}

test("the reported deep-link guard uses one condition per line and an expanded exit block", () => {
    const source = `enum Samples {
    static func streamingURL(fromDeepLink url: URL, defaults: UserDefaults = DefaultsKey.shared) -> String? {
        guard url.scheme == "musiccloud", url.host == "resolve", let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
            let parameter = components.queryItems?.first(where: { $0.name == "url" })?.value, isStreamingURL(parameter, defaults: defaults)
        else { return nil }
        return parameter
    }
}
`;
    const expected = `enum Samples {
    static func streamingURL(fromDeepLink url: URL, defaults: UserDefaults = DefaultsKey.shared) -> String? {
        guard
            url.scheme == "musiccloud",
            url.host == "resolve",
            let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
            let parameter = components.queryItems?.first(where: { $0.name == "url" })?.value,
            isStreamingURL(parameter, defaults: defaults)
        else {
            return nil
        }
        return parameter
    }
}
`;
    assert.equal(format(source), expected);
});

test("guard layout preserves comments, Unicode, literals, and commas inside expressions", () => {
    const source = `func sample() -> String? {
    let note = "Künstler 🎵 guard first, second else"
    guard let value = make(first: 1, second: 2), /* précondition */ accepts(value, matching: "a,b") else { return nil }
    return note
}
`;
    const output = format(source);
    assert.match(output, /let value = make\(first: 1, second: 2\),/);
    assert.match(output, /accepts\(value, matching: "a,b"\)/);
    assert.ok(output.includes('"Künstler 🎵 guard first, second else"'));
    assert.ok(output.includes("/* précondition */"));
    assert.equal(format(output), output);
    execFileSync("xcrun", ["swiftc", "-frontend", "-parse", "-enable-bare-slash-regex", "-"], { input: output });
});

test("nested and single-condition guards keep expanded exit blocks and valid syntax", () => {
    const output = format("func sample() {\n guard first else { guard second, third else { return }; return }\n}\n");
    assert.match(output, /guard first\n/);
    assert.match(output, /guard\n\s+second,\n\s+third\n/);
    assert.equal(format(output), output);
    execFileSync("xcrun", ["swiftc", "-frontend", "-parse", "-enable-bare-slash-regex", "-"], { input: output });
});

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
