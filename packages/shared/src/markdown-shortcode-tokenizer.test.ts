import { describe, expect, it } from "vitest";
import {
  MAX_BODY_LENGTH,
  MAX_NODE_LENGTH,
  ShortcodeSyntaxIssueCode,
  tokenizeShortcodes,
} from "./markdown-shortcode-tokenizer.js";
import { ShortcodeSyntax } from "./markdown-shortcodes/index.js";

describe("tokenizeShortcodes — the bracket form", () => {
  it("reads a token, a target and its attributes", () => {
    const [node] = tokenizeShortcodes("[[pill:Beta tone=info case=upper]]");

    expect(node.syntax).toBe(ShortcodeSyntax.Bracket);
    expect(node.token).toBe("pill");
    expect(node.target).toBe("Beta");
    expect(node.attributes).toEqual({ tone: "info", case: "upper" });
  });

  it("lets a target run over several words, stopping at the first attribute", () => {
    const [node] = tokenizeShortcodes("[[pill:No longer available tone=alert]]");

    expect(node.target).toBe("No longer available");
    expect(node.attributes).toEqual({ tone: "alert" });
  });

  it("keeps a quoted value whole, brackets and all", () => {
    const [node] = tokenizeShortcodes('[[pill:x note="see [[pill]] above"]]');

    expect(node.attributes.note).toBe("see [[pill]] above");
  });

  it("reads a bare name as a flag", () => {
    const [node] = tokenizeShortcodes("[[card recommended]]");

    expect(node.attributes.recommended).toBe(true);
  });

  it("takes a bare word after a target as part of that target", () => {
    // The two are indistinguishable once a target may be several words, and
    // the target wins. A shortcode needing a flag alongside a multi-word target
    // has to spell it out as `flag=true`.
    const [node] = tokenizeShortcodes("[[pill:x recommended]]");

    expect(node.target).toBe("x recommended");
    expect(node.attributes).toEqual({});
  });

  it("records where every part of the source stands", () => {
    const source = "[[pill:Beta tone=info]]";
    const [node] = tokenizeShortcodes(source);

    const token = node.spans.find((span) => span.kind === "token");
    expect(source.slice(token?.from, token?.to)).toBe("pill");

    const target = node.spans.find((span) => span.kind === "target");
    expect(source.slice(target?.from, target?.to)).toBe("Beta");

    const value = node.spans.find((span) => span.kind === "value-bare");
    expect(source.slice(value?.from, value?.to)).toBe("info");
  });

  it("leaves a node with an unterminated value as text, since it never closes", () => {
    expect(tokenizeShortcodes('[[pill:x note="never closed')).toHaveLength(0);
  });

  it("leaves an escaped opening marker alone", () => {
    expect(tokenizeShortcodes("\\[[pill:x]]")).toHaveLength(0);
  });

  it("leaves a lone closing bracket in prose as text", () => {
    expect(tokenizeShortcodes("An array index like items[0] is not a shortcode.")).toHaveLength(0);
  });

  it("abandons a node that never closes rather than swallowing the document", () => {
    expect(tokenizeShortcodes(`[[pill:x ${"a".repeat(MAX_NODE_LENGTH)}`)).toHaveLength(0);
  });
});

describe("tokenizeShortcodes — bodies and nesting", () => {
  it("reads a body and strips the indentation of its nesting", () => {
    const [node] = tokenizeShortcodes("[[card {\n    ## Title\n\n    Some copy.\n}]]");

    expect(node.body).toBe("## Title\n\nSome copy.");
  });

  it("closes a container on its own brace, not on a nested one", () => {
    const [node] = tokenizeShortcodes("[[card {\nouter\n[[card {\ninner\n}]]\n}]]");

    expect(node.body).toContain("[[card {");
    expect(node.body).toContain("inner");
    expect(node.body?.endsWith("}]]")).toBe(true);
  });

  it("keeps an escaped brace as text and drops its backslash", () => {
    const [node] = tokenizeShortcodes("[[card {\nA literal \\{ brace.\n}]]");

    expect(node.body).toBe("A literal { brace.");
  });

  it("reports a body that never closes", () => {
    expect(tokenizeShortcodes("[[card {\nnever closed")).toHaveLength(0);
  });

  it("abandons a body that outgrows its cap", () => {
    expect(tokenizeShortcodes(`[[card {${"a".repeat(MAX_BODY_LENGTH + 1)}`)).toHaveLength(0);
  });

  it("refuses an attribute written after the body", () => {
    expect(tokenizeShortcodes("[[card {\ncopy\n} tone=info]]")).toHaveLength(0);
  });
});

describe("tokenizeShortcodes — the fence form", () => {
  it("reads a token, its attributes and the content between the markers", () => {
    const [node] = tokenizeShortcodes(":::fields gap=2rem\nMethod: GET\nPath: /v1\n:::");

    expect(node.syntax).toBe(ShortcodeSyntax.Fence);
    expect(node.token).toBe("fields");
    expect(node.attributes).toEqual({ gap: "2rem" });
    expect(node.body).toBe("Method: GET\nPath: /v1");
  });

  it("opens only at the start of a line", () => {
    expect(tokenizeShortcodes("text :::fields\nMethod: GET\n:::")).toHaveLength(0);
  });

  it("returns nothing for a fence that never closes", () => {
    expect(tokenizeShortcodes(":::fields\nMethod: GET")).toHaveLength(0);
  });

  it("carries on scanning after the closing marker", () => {
    const nodes = tokenizeShortcodes(":::fields\nMethod: GET\n:::\n\nThen [[pill:Beta]].");

    expect(nodes.map((node) => node.token)).toEqual(["fields", "pill"]);
  });

  it("stops an unterminated value at the end of the opening line", () => {
    const [node] = tokenizeShortcodes(':::fields gap="never closed\nMethod: GET\n:::');

    expect(node.issues.map((issue) => issue.code)).toContain(ShortcodeSyntaxIssueCode.UnterminatedValue);
    expect(node.attributes.gap).toBe("never closed");
    // The content survives, which is the point: the mistake stays on the line
    // it was made on instead of swallowing the rest of the page.
    expect(node.body).toBe("Method: GET");
  });
});

describe("tokenizeShortcodes — the braces form", () => {
  it("takes what stands between the braces as its target", () => {
    const [node] = tokenizeShortcodes("Press {{Esc}} to close.");

    expect(node.syntax).toBe(ShortcodeSyntax.Braces);
    expect(node.token).toBe("");
    expect(node.target).toBe("Esc");
  });

  it("reads each of two in the same sentence", () => {
    const nodes = tokenizeShortcodes("{{Cmd}} + {{K}} opens the search.");

    expect(nodes.map((node) => node.target)).toEqual(["Cmd", "K"]);
  });

  it("ignores an empty pair", () => {
    expect(tokenizeShortcodes("nothing here: {{}}")).toHaveLength(0);
  });

  it("ignores a pair spanning a line break, which is a stray brace rather than a key", () => {
    expect(tokenizeShortcodes("{{Esc\nCmd}}")).toHaveLength(0);
  });

  it("leaves an escaped opening marker alone", () => {
    expect(tokenizeShortcodes("\\{{Esc}}")).toHaveLength(0);
  });
});
