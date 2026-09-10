import { describe, expect, it } from "vitest";
import { ContentContext } from "./content-context.js";
import { parseShortcodes, ShortcodeIssueCode } from "./markdown-shortcode-parser.js";
import {
  ShortcodeBodyRule,
  type ShortcodeDefinition,
  ShortcodeParamType,
  ShortcodePlacement,
  ShortcodeRenderMode,
  ShortcodeSyntax,
  ShortcodeTargetRule,
} from "./markdown-shortcodes/index.js";

const EVERY_CONTEXT = ContentContext.Frontend | ContentContext.DeveloperPortal;

/** A shortcode taking one parameter of every type, so the reading of each is covered. */
const EVERY_TYPE: ShortcodeDefinition = {
  token: "sample",
  syntax: ShortcodeSyntax.Bracket,
  renderMode: ShortcodeRenderMode.Html,
  target: ShortcodeTargetRule.Optional,
  placement: ShortcodePlacement.Block,
  label: "Sample",
  description: "One parameter of every type, for the tests.",
  examples: ["[[sample size=8]]"],
  allowedContextMask: EVERY_CONTEXT,
  params: [
    { name: "title", type: ShortcodeParamType.String },
    { name: "size", type: ShortcodeParamType.Integer, min: 1, max: 100, defaultValue: 24 },
    { name: "boxed", type: ShortcodeParamType.Boolean, defaultValue: false },
    {
      name: "alignment",
      type: ShortcodeParamType.Enum,
      values: ["leading", "center", "trailing"],
      defaultValue: "leading",
    },
    { name: "spacing", type: ShortcodeParamType.Integer, aliases: ["gap", "space-between"] },
    { name: "caption", type: ShortcodeParamType.String, required: true },
  ],
};

/** A container holding only itself, so nesting can be followed to any depth. */
const CONTAINER: ShortcodeDefinition = {
  token: "stack",
  syntax: ShortcodeSyntax.Bracket,
  renderMode: ShortcodeRenderMode.Html,
  target: ShortcodeTargetRule.Forbidden,
  placement: ShortcodePlacement.Block,
  body: ShortcodeBodyRule.Markdown,
  label: "Stack",
  description: "Holds page content, including another stack.",
  examples: ["[[stack {\ncopy\n}]]"],
  allowedContextMask: EVERY_CONTEXT,
  params: [],
};

/** A shortcode that only means something inside another one. */
const CHILD_ONLY: ShortcodeDefinition = {
  token: "option",
  syntax: ShortcodeSyntax.Bracket,
  renderMode: ShortcodeRenderMode.Html,
  target: ShortcodeTargetRule.Required,
  placement: ShortcodePlacement.Inline,
  label: "Option",
  description: "One choice, and only inside a chooser.",
  examples: ["[[option:one]]"],
  allowedContextMask: EVERY_CONTEXT,
  params: [],
};

const CHOOSER: ShortcodeDefinition = {
  token: "chooser",
  syntax: ShortcodeSyntax.Bracket,
  renderMode: ShortcodeRenderMode.Html,
  target: ShortcodeTargetRule.Forbidden,
  placement: ShortcodePlacement.Block,
  label: "Chooser",
  description: "A set of options.",
  examples: ["[[chooser [[option:one]]]]"],
  allowedContextMask: EVERY_CONTEXT,
  params: [],
  children: [CHILD_ONLY],
};

const TEST_DEFINITIONS = [EVERY_TYPE, CONTAINER, CHOOSER];

describe("parseShortcodes — reading parameters", () => {
  it("reads one parameter of every type", () => {
    const [parsed] = parseShortcodes(
      '[[sample title="A heading" size=48 boxed=true alignment=center caption="x"]]',
      TEST_DEFINITIONS,
    );

    expect(parsed.params).toEqual({
      title: "A heading",
      size: 48,
      boxed: true,
      alignment: "center",
      caption: "x",
    });
  });

  it("fills in the declared defaults for what was left out", () => {
    const [parsed] = parseShortcodes('[[sample caption="x"]]', TEST_DEFINITIONS);

    expect(parsed.params).toEqual({ size: 24, boxed: false, alignment: "leading", caption: "x" });
  });

  it("resolves an alias to the parameter it stands for", () => {
    const [byName] = parseShortcodes('[[sample spacing=8 caption="x"]]', TEST_DEFINITIONS);
    const [byAlias] = parseShortcodes('[[sample gap=8 caption="x"]]', TEST_DEFINITIONS);
    const [byHyphen] = parseShortcodes('[[sample space-between=8 caption="x"]]', TEST_DEFINITIONS);

    expect(byName.params.spacing).toBe(8);
    expect(byAlias.params.spacing).toBe(8);
    expect(byHyphen.params.spacing).toBe(8);
  });

  it("reads a bare name as true only where the parameter is a boolean", () => {
    const [parsed] = parseShortcodes('[[sample boxed caption="x"]]', TEST_DEFINITIONS);

    expect(parsed.params.boxed).toBe(true);
    expect(parsed.issues).toHaveLength(0);
  });

  it("reports a bare name on a parameter that needs a value, and keeps the default", () => {
    const [parsed] = parseShortcodes('[[sample size caption="x"]]', TEST_DEFINITIONS);

    expect(parsed.issues[0]).toMatchObject({
      code: ShortcodeIssueCode.MissingParamValue,
      attribute: "size",
    });
    expect(parsed.params.size).toBe(24);
  });

  it("refuses an integer outside its declared bounds and keeps the default", () => {
    const [parsed] = parseShortcodes('[[sample size=400 caption="x"]]', TEST_DEFINITIONS);

    expect(parsed.issues[0]).toMatchObject({
      code: ShortcodeIssueCode.InvalidParam,
      attribute: "size",
    });
    expect(parsed.params.size).toBe(24);
  });

  it("refuses a name the enum does not list", () => {
    const [parsed] = parseShortcodes('[[sample alignment=sideways caption="x"]]', TEST_DEFINITIONS);

    expect(parsed.issues[0]).toMatchObject({
      code: ShortcodeIssueCode.InvalidParam,
      attribute: "alignment",
    });
    expect(parsed.params.alignment).toBe("leading");
  });

  it("reports a required parameter that was left out", () => {
    const [parsed] = parseShortcodes("[[sample size=8]]", TEST_DEFINITIONS);

    expect(parsed.issues[0]).toMatchObject({
      code: ShortcodeIssueCode.MissingParam,
      attribute: "caption",
    });
  });

  it("ignores an attribute nothing declares, since somebody may be typing", () => {
    const [parsed] = parseShortcodes('[[sample nonsense=1 caption="x"]]', TEST_DEFINITIONS);

    expect(parsed.issues).toHaveLength(0);
    expect(parsed.params.nonsense).toBeUndefined();
    expect(parsed.attributes.nonsense).toBe("1");
  });
});

describe("parseShortcodes — what a definition allows", () => {
  it("reports a target on a shortcode that takes none", () => {
    const [parsed] = parseShortcodes("[[stack:something {\ncopy\n}]]", TEST_DEFINITIONS);

    expect(parsed.issues.map((issue) => issue.code)).toContain(ShortcodeIssueCode.TargetForbidden);
  });

  it("reports a missing target where one is required", () => {
    const [parsed] = parseShortcodes("[[chooser [[option]]]]", TEST_DEFINITIONS);

    expect(parsed.children[0].issues.map((issue) => issue.code)).toContain(ShortcodeIssueCode.MissingTarget);
  });

  it("reports content on a shortcode that carries none", () => {
    const [parsed] = parseShortcodes('[[sample caption="x" {\ncopy\n}]]', TEST_DEFINITIONS);

    expect(parsed.issues.map((issue) => issue.code)).toContain(ShortcodeIssueCode.BodyForbidden);
  });

  it("reports a container written without content", () => {
    const [parsed] = parseShortcodes("[[stack]]", TEST_DEFINITIONS);

    expect(parsed.issues.map((issue) => issue.code)).toContain(ShortcodeIssueCode.MissingBody);
  });
});

describe("parseShortcodes — unknown tokens", () => {
  it("returns nothing for a token no definition claims", () => {
    expect(parseShortcodes("[[nosuchthing size=8]]", TEST_DEFINITIONS)).toHaveLength(0);
  });

  it("leaves the shortcodes around an unknown one intact", () => {
    const parsed = parseShortcodes('[[sample caption="a"]] [[nosuchthing]] [[sample caption="b"]]', TEST_DEFINITIONS);

    expect(parsed.map((shortcode) => shortcode.params.caption)).toEqual(["a", "b"]);
  });

  it("returns nothing when the notation does not match the definition", () => {
    // `sample` is declared as a bracket shortcode, so a fence by that name is
    // not it, and the source stays on the page as text.
    expect(parseShortcodes(":::sample\ncopy\n:::", TEST_DEFINITIONS)).toHaveLength(0);
  });
});

describe("parseShortcodes — nesting", () => {
  it("keeps a container's content as source rather than resolving it", () => {
    const [parsed] = parseShortcodes("[[stack {\n[[stack {\ninner\n}]]\n}]]", TEST_DEFINITIONS);

    expect(parsed.children).toHaveLength(0);
    expect(parsed.body).toContain("[[stack {");
  });

  it("resolves that content when it is parsed in turn, to any depth", () => {
    const [outer] = parseShortcodes("[[stack {\n[[stack {\n[[stack {\ndeep\n}]]\n}]]\n}]]", TEST_DEFINITIONS);
    const [middle] = parseShortcodes(outer.body ?? "", TEST_DEFINITIONS);
    const [inner] = parseShortcodes(middle.body ?? "", TEST_DEFINITIONS);

    expect(inner.body).toBe("deep");
  });

  it("resolves a child against its parent's own list", () => {
    const [parsed] = parseShortcodes("[[chooser [[option:one]] [[option:two]]]]", TEST_DEFINITIONS);

    expect(parsed.children.map((child) => child.target)).toEqual(["one", "two"]);
  });

  it("ignores a child token that means nothing at the top level", () => {
    expect(parseShortcodes("[[option:one]]", TEST_DEFINITIONS)).toHaveLength(0);
  });
});
