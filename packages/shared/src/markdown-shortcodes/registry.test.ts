import { describe, expect, it } from "vitest";
import { ContentContext } from "../content-context.js";
import { parseShortcodes } from "../markdown-shortcode-parser.js";
import {
  SUPPORT_LADDER_MINIMUM_PLACEHOLDER_NAME,
  SUPPORT_LADDER_YEARLY_TOTAL_PLACEHOLDER_NAME,
} from "../support-ladder.js";
import {
  assertRegistryIsUnambiguous,
  getShortcodeDefinition,
  SHORTCODE_DEFINITIONS,
  shortcodesForContext,
} from "./registry.js";
import { ShortcodeToken } from "./tokens.js";
import {
  type ShortcodeDefinition,
  type ShortcodeParamDefinition,
  ShortcodeParamType,
  ShortcodePlacement,
  ShortcodeRenderMode,
  ShortcodeSyntax,
  ShortcodeTargetRule,
  writtenPlaceholder,
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

/**
 * Every parameter in the registry, nested shortcodes included, with the token it belongs to.
 *
 * @returns One entry per parameter, in declaration order.
 */
function everyParam(): { token: string; param: ShortcodeParamDefinition }[] {
  const found: { token: string; param: ShortcodeParamDefinition }[] = [];
  const walk = (definition: ShortcodeDefinition) => {
    for (const param of definition.params) found.push({ token: definition.token, param });
    for (const child of definition.children ?? []) walk(child);
  };
  for (const definition of SHORTCODE_DEFINITIONS) walk(definition);
  return found;
}

/** How a placeholder's name is typed between its braces: a letter, then letters and digits. */
const PLACEHOLDER_NAME = /^[a-zA-Z][a-zA-Z0-9]*$/;

describe("shortcode parameter placeholders", () => {
  it("names every placeholder as a plain word, the way it is typed", () => {
    for (const { token, param } of everyParam()) {
      for (const placeholder of param.placeholders ?? []) {
        expect(
          PLACEHOLDER_NAME.test(placeholder.name),
          `[[${token}]] ${param.name} declares {${placeholder.name}}`,
        ).toBe(true);
      }
    }
  });

  it("describes every placeholder as the phrase that follows 'is replaced by'", () => {
    // The panel writes that phrase itself, so a description starting with a
    // capital reads as a sentence broken in half.
    for (const { token, param } of everyParam()) {
      for (const placeholder of param.placeholders ?? []) {
        expect(placeholder.description[0], `[[${token}]] ${param.name}: ${placeholder.description}`).toBe(
          placeholder.description[0]?.toLowerCase(),
        );
      }
    }
  });

  it("declares the support ladder's placeholders on the parameters that accept them", () => {
    const declared = (token: string, name: string) =>
      everyParam()
        .find((entry) => entry.token === token && entry.param.name === name)
        ?.param.placeholders?.map((placeholder) => placeholder.name);

    expect(declared(ShortcodeToken.SponsorForm, "claimRemaining")).toEqual(["n"]);
    expect(declared(ShortcodeToken.Interval, "text")).toEqual([SUPPORT_LADDER_YEARLY_TOTAL_PLACEHOLDER_NAME]);
    expect(declared(ShortcodeToken.Interval, "belowMinimum")).toEqual([SUPPORT_LADDER_MINIMUM_PLACEHOLDER_NAME]);
  });

  it("never explains a declared placeholder again in its parameter's label", () => {
    // The panel lists the declaration under the parameter, so a label that
    // explains it as well says the same thing twice in two places.
    for (const { token, param } of everyParam()) {
      for (const placeholder of param.placeholders ?? []) {
        expect(param.label ?? "", `[[${token}]] ${param.name}`).not.toContain(writtenPlaceholder(placeholder.name));
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
    expect(() => assertRegistryIsUnambiguous([base, { ...base, syntax: ShortcodeSyntax.Braces }])).not.toThrow();
  });

  it("refuses a second braces shortcode, which nothing could tell apart", () => {
    const braces = { ...base, syntax: ShortcodeSyntax.Braces };

    expect(() => assertRegistryIsUnambiguous([braces, { ...braces, token: "two" }])).toThrow(
      /both use the \{\{…\}\} notation/,
    );
  });
});

describe("the order the reference lists them in", () => {
  it("is alphabetical by token, so a writer can look one up", () => {
    const tokens = SHORTCODE_DEFINITIONS.map((definition) => definition.token);

    expect(tokens).toEqual([...tokens].sort((first, second) => first.localeCompare(second)));
  });
});
