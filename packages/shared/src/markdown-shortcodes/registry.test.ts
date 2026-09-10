import { describe, expect, it } from "vitest";
import { ContentContext } from "../content-context.js";
import { parseShortcodes } from "../markdown-shortcode-parser.js";
import {
  assertRegistryIsUnambiguous,
  getShortcodeDefinition,
  SHORTCODE_DEFINITIONS,
  shortcodesForContext,
} from "./registry.js";
import {
  type ShortcodeDefinition,
  ShortcodeParamType,
  ShortcodePlacement,
  ShortcodeRenderMode,
  ShortcodeSyntax,
  ShortcodeTargetRule,
} from "./types.js";

describe("the registry", () => {
  it("finds a shortcode by its token", () => {
    expect(getShortcodeDefinition("pill")?.label).toBe("Pill");
  });

  it("returns nothing for a token it does not know", () => {
    expect(getShortcodeDefinition("nosuchthing")).toBeUndefined();
  });

  it("gives every shortcode a label, a description and at least one example", () => {
    // What the reference panel shows. A definition missing any of the three
    // renders as a gap in the help rather than as a failure anywhere.
    for (const definition of SHORTCODE_DEFINITIONS) {
      expect(definition.label, definition.token).not.toBe("");
      expect(definition.description, definition.token).not.toBe("");
      expect(definition.examples.length, definition.token).toBeGreaterThan(0);
    }
  });

  it("gives every enum parameter the values it accepts", () => {
    for (const definition of SHORTCODE_DEFINITIONS) {
      for (const param of definition.params) {
        if (param.type !== ShortcodeParamType.Enum) continue;
        expect(param.values?.length, `${definition.token}.${param.name}`).toBeGreaterThan(0);
      }
    }
  });

  it("states a default one way or the other, never both", () => {
    for (const definition of SHORTCODE_DEFINITIONS) {
      for (const param of definition.params) {
        const statedTwice = param.defaultValue !== undefined && param.defaultLabel !== undefined;
        expect(statedTwice, `${definition.token}.${param.name}`).toBe(false);
      }
    }
  });

  it("keeps every declared example free of the mistakes it warns about", () => {
    // The examples are what somebody copies out of the reference, so one that
    // does not parse is a broken instruction rather than a broken test.
    for (const definition of SHORTCODE_DEFINITIONS) {
      for (const example of definition.examples) {
        const parsed = parseShortcodes(example, SHORTCODE_DEFINITIONS);
        expect(parsed.length, `${definition.token}: ${example}`).toBeGreaterThan(0);
        for (const shortcode of parsed) {
          expect(shortcode.issues, `${definition.token}: ${example}`).toEqual([]);
        }
      }
    }
  });
});

describe("shortcodesForContext", () => {
  it("offers the portal what the portal may use", () => {
    const tokens = shortcodesForContext(ContentContext.DeveloperPortal).map((definition) => definition.token);

    expect(tokens).toContain("fields");
    expect(tokens).toContain("pill");
  });

  it("keeps a shortcode reserved to one context out of the other", () => {
    const portalOnly = SHORTCODE_DEFINITIONS.filter(
      (definition) => definition.allowedContextMask === ContentContext.DeveloperPortal,
    );
    const onTheSite = shortcodesForContext(ContentContext.Frontend).map((definition) => definition.token);

    // Cards are the first of these. Offering one where no stylesheet gives it a
    // surface would render an unstyled block, so the mask is what stops it.
    expect(portalOnly.length).toBeGreaterThan(0);
    for (const definition of portalOnly) {
      expect(onTheSite, definition.token).not.toContain(definition.token);
    }
  });

  it("offers a shortcode allowed in both contexts to each of them", () => {
    for (const context of [ContentContext.Frontend, ContentContext.DeveloperPortal]) {
      expect(shortcodesForContext(context).map((definition) => definition.token)).toContain("pill");
    }
  });
});

describe("assertRegistryIsUnambiguous", () => {
  const base: ShortcodeDefinition = {
    token: "one",
    syntax: ShortcodeSyntax.Bracket,
    renderMode: ShortcodeRenderMode.Html,
    target: ShortcodeTargetRule.Forbidden,
    placement: ShortcodePlacement.Block,
    label: "One",
    description: "A shortcode.",
    examples: ["[[one]]"],
    allowedContextMask: ContentContext.Frontend,
    params: [],
  };

  it("accepts the registry the project actually ships", () => {
    expect(() => assertRegistryIsUnambiguous(SHORTCODE_DEFINITIONS)).not.toThrow();
  });

  it("refuses a token claimed twice, which would make the order decide", () => {
    expect(() => assertRegistryIsUnambiguous([base, { ...base }])).toThrow(/claim the token "one"/);
  });

  it("accepts the same token in two different notations", () => {
    expect(() => assertRegistryIsUnambiguous([base, { ...base, syntax: ShortcodeSyntax.Fence }])).not.toThrow();
  });

  it("refuses a second braces shortcode, which nothing could tell apart", () => {
    const braces = { ...base, syntax: ShortcodeSyntax.Braces };

    expect(() => assertRegistryIsUnambiguous([braces, { ...braces, token: "two" }])).toThrow(
      /both use the \{\{…\}\} notation/,
    );
  });
});
