import {
  SHORTCODE_DEFINITIONS,
  type ShortcodeDefinition,
  ShortcodeParamType,
  ShortcodePlacement,
  ShortcodeRenderMode,
  ShortcodeSyntax,
  ShortcodeTargetRule,
  SITE_VARIABLE_NAMES,
  SITE_VARIABLES,
} from "@musiccloud/shared";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ShortcodeList, SiteVariableList } from "@/components/ui/ShortcodeReference";

describe("ShortcodeList", () => {
  it("shows every registered shortcode, so none can be added without appearing here", () => {
    const { container } = render(<ShortcodeList />);
    const text = container.textContent ?? "";

    for (const definition of SHORTCODE_DEFINITIONS) {
      expect(text, definition.token).toContain(definition.label);
      expect(text, definition.token).toContain(definition.description);
    }
  });

  it("writes each shortcode in the notation it is actually typed in", () => {
    const { container } = render(<ShortcodeList />);
    const text = container.textContent ?? "";

    // Two notations that look nothing alike, so one form shown for both would
    // be a false instruction rather than a shorthand. A container is written
    // with its braces, and a word set apart is written with none.
    expect(text).toContain("[[fields { … }]]");
    expect(text).toContain("[[pill:…]]");
    expect(text).toContain("{{…}}");
  });

  it("shows every parameter with its name and what it accepts", () => {
    const { container } = render(<ShortcodeList />);
    const text = container.textContent ?? "";

    for (const definition of SHORTCODE_DEFINITIONS) {
      for (const param of definition.params) {
        expect(text, `${definition.token}.${param.name}`).toContain(param.name);
        if (param.values) {
          expect(text, `${definition.token}.${param.name}`).toContain(param.values.join(" | "));
        }
      }
    }
  });

  it("states what holds when a parameter with a default is left out", () => {
    const { container } = render(<ShortcodeList />);
    const text = container.textContent ?? "";

    for (const definition of SHORTCODE_DEFINITIONS) {
      for (const param of definition.params) {
        if (param.defaultValue === undefined) continue;
        expect(text, `${definition.token}.${param.name}`).toContain(`without it: ${param.defaultValue}`);
      }
    }
  });

  it("shows every reference table a definition carries", () => {
    const { container } = render(<ShortcodeList />);
    const text = container.textContent ?? "";

    for (const definition of SHORTCODE_DEFINITIONS) {
      for (const table of definition.tables ?? []) {
        expect(text, definition.token).toContain(table.caption);
        for (const row of table.rows) {
          expect(text, `${definition.token}: ${row[0]}`).toContain(row[0]);
        }
      }
    }
  });

  it("shows every declared example, which is what a writer copies", () => {
    const { container } = render(<ShortcodeList />);
    const text = container.textContent ?? "";

    for (const definition of SHORTCODE_DEFINITIONS) {
      for (const example of definition.examples) {
        expect(text, `${definition.token}: ${example}`).toContain(example);
      }
    }
  });
});

describe("ShortcodeList — a default that lives in the stylesheet", () => {
  /** A definition whose default names a custom property instead of stating a figure. */
  const WITH_TOKEN_DEFAULT: ShortcodeDefinition = {
    token: "spaced",
    syntax: ShortcodeSyntax.Bracket,
    renderMode: ShortcodeRenderMode.Html,
    target: ShortcodeTargetRule.Forbidden,
    placement: ShortcodePlacement.Block,
    label: "Spaced",
    description: "Takes its spacing from the stylesheet.",
    examples: ["[[spaced]]"],
    allowedContextMask: 1,
    params: [
      {
        name: "spacing",
        type: ShortcodeParamType.Integer,
        defaultLabel: "var(--ds-reference-probe)",
        label: "Gap in pixels",
      },
    ],
  };

  it("resolves a var(--token) default to the figure the page renders", () => {
    // jsdom has no layout engine, so the measurement itself is stood in for.
    // What is under test is that the reference asks the page for the property
    // and shows what comes back, rather than holding a copy of the figure.
    const asked: string[] = [];
    const realGetComputedStyle = window.getComputedStyle;
    vi.spyOn(window, "getComputedStyle").mockImplementation((element: Element) => {
      const probe = element as HTMLElement;
      if (probe.style.width.startsWith("var(--ds-reference-probe")) {
        asked.push(probe.style.width);
        return { width: "18px" } as CSSStyleDeclaration;
      }
      return realGetComputedStyle(element);
    });

    try {
      const { container } = render(<ShortcodeList definitions={[WITH_TOKEN_DEFAULT]} />);

      expect(asked).toEqual(["var(--ds-reference-probe)"]);
      expect(container.textContent).toContain("without it: 18px");
      expect(container.textContent).not.toContain("var(--ds-reference-probe)");
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("falls back to the property's name when the page does not set it", () => {
    const { container } = render(
      <ShortcodeList
        definitions={[
          {
            ...WITH_TOKEN_DEFAULT,
            params: [{ ...WITH_TOKEN_DEFAULT.params[0], defaultLabel: "var(--ds-nothing-sets-this)" }],
          },
        ]}
      />,
    );

    // Better than a figure that would be wrong: the name is at least something
    // a reader can go and look up.
    expect(container.textContent).toContain("var(--ds-nothing-sets-this)");
  });
});

describe("SiteVariableList", () => {
  it("shows every variable with its name, its label and an example", () => {
    const { container } = render(<SiteVariableList />);
    const text = container.textContent ?? "";

    for (const name of SITE_VARIABLE_NAMES) {
      expect(text, name).toContain(`{${name}}`);
      expect(text, name).toContain(SITE_VARIABLES[name].label);
      expect(text, name).toContain(SITE_VARIABLES[name].example);
    }
  });
});
