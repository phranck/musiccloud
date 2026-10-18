import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const stylesheet = document.createElement("style");

beforeAll(() => {
  stylesheet.textContent = readFileSync(resolve("src/styles/glass.css"), "utf8");
  document.head.append(stylesheet);
});

afterAll(() => stylesheet.remove());

describe("card material and content painting", () => {
  it("keeps shadow painting outside content clipping without permanent compositor hints", () => {
    const rules = Array.from(stylesheet.sheet?.cssRules ?? []).filter(
      (rule): rule is CSSStyleRule => rule instanceof CSSStyleRule,
    );
    const root = rules.find((rule) => rule.selectorText === ".embossed-gradient-border.mc-glass-card");
    const plate = rules.find((rule) => rule.selectorText === ".mc-card-shadow");
    const material = rules.find((rule) => rule.selectorText === ".mc-card-material");
    const silhouette = rules.find((rule) => rule.selectorText === ".mc-card-shadow::before");
    const content = rules.find((rule) => rule.selectorText === ".mc-card-content");
    const visibleContent = rules.find(
      (rule) => rule.selectorText === ".mc-glass-card.overflow-visible > .mc-card-content",
    );

    expect(root?.style.boxShadow).toBe("none");
    expect(root?.style.background).toBe("none");
    expect(root?.style.overflow).toBe("visible");
    expect(root?.style.transform).toBe("");
    expect(root?.style.willChange).toBe("");
    expect(plate?.style.position).toBe("absolute");
    expect(plate?.style.maskComposite).toBe("exclude");
    expect(plate?.style.pointerEvents).toBe("none");
    expect(material?.style.borderRadius).toBe("inherit");
    expect(material?.style.background).toBe("var(--_t)");
    expect(silhouette?.style.filter).toBe("blur(calc(var(--mc-shadow-blur) / 2))");
    expect(silhouette?.style.background).toContain("var(--_sh)");
    expect(content?.style.overflow).toBe("hidden");
    expect(content?.style.display).toBe("inherit");
    expect(content?.style.flex).toBe("1 1 auto");
    expect(content?.style.minHeight).toBe("0px");
    expect(content?.style.borderRadius).toBe("var(--mc-card-clip-radius, inherit)");
    expect(visibleContent?.style.overflow).toBe("visible");
  });
});
