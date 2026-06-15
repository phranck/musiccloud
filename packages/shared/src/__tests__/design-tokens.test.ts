import { describe, expect, it } from "vitest";
import { CARD_RADIUS_DEFAULT, DESIGN_TOKENS_DEFAULTS, parseDesignTokens, SHADER_DEFAULTS } from "../design-tokens.js";

/** A minimal but valid prototype-shaped export used as a mutation base. */
function validExport(): Record<string, unknown> {
  return JSON.parse(
    JSON.stringify({
      // shader keys spread flat at the top level (as the prototype exports them)
      ...SHADER_DEFAULTS,
      cardRadius: 24,
      glass: DESIGN_TOKENS_DEFAULTS.glass,
      text: DESIGN_TOKENS_DEFAULTS.text,
      vfd: DESIGN_TOKENS_DEFAULTS.vfd,
      footer: DESIGN_TOKENS_DEFAULTS.footer,
      cover: DESIGN_TOKENS_DEFAULTS.cover,
      backdrop: DESIGN_TOKENS_DEFAULTS.backdrop,
    }),
  );
}

describe("parseDesignTokens — happy path", () => {
  it("round-trips the canonical defaults with no errors", () => {
    const exported = {
      ...SHADER_DEFAULTS,
      cardRadius: CARD_RADIUS_DEFAULT,
      glass: DESIGN_TOKENS_DEFAULTS.glass,
      text: DESIGN_TOKENS_DEFAULTS.text,
      vfd: DESIGN_TOKENS_DEFAULTS.vfd,
      footer: DESIGN_TOKENS_DEFAULTS.footer,
      cover: DESIGN_TOKENS_DEFAULTS.cover,
      backdrop: DESIGN_TOKENS_DEFAULTS.backdrop,
    };
    const { tokens, errors } = parseDesignTokens(exported);
    expect(errors).toEqual([]);
    expect(tokens).toEqual(DESIGN_TOKENS_DEFAULTS);
  });

  it("accepts a JSON string input", () => {
    const { tokens, errors } = parseDesignTokens(JSON.stringify(validExport()));
    expect(errors).toEqual([]);
    expect(tokens.cardRadius).toBe(24);
  });

  it("reads the single-group wrapper quirks 1:1 (vfd.vfd, footer.skytext, cover.cover, backdrop.backdrop)", () => {
    const { tokens } = parseDesignTokens(validExport());
    expect(tokens.vfd.vfd.day.bg).toBe("#00364a");
    expect(tokens.footer.skytext.night.opacity).toBe(0.55);
    expect(tokens.cover.cover.day.tintColor).toBe("#caf0fe");
    expect(tokens.backdrop.backdrop.day.blur).toBe(3);
  });

  it("exports & applies the footer text size, clamped to range and defaulted when missing", () => {
    const within = parseDesignTokens({ footer: { skytext: { day: { size: 20 } } } });
    expect(within.tokens.footer.skytext.day.size).toBe(20);
    // the untouched night half keeps its canonical default size
    expect(within.tokens.footer.skytext.night.size).toBe(DESIGN_TOKENS_DEFAULTS.footer.skytext.night.size);

    const tooBig = parseDesignTokens({ footer: { skytext: { day: { size: 999 } } } });
    expect(tooBig.tokens.footer.skytext.day.size).toBe(48); // clamped to the 8..48 range max

    const missing = parseDesignTokens({});
    expect(missing.tokens.footer.skytext.day.size).toBe(13); // canonical default
  });

  it("normalises flat shader keys into the shader namespace", () => {
    const raw = validExport();
    raw.cloudCoverage = 0.5;
    raw.skyTop = "#ABCDEF";
    const { tokens } = parseDesignTokens(raw);
    expect(tokens.shader.cloudCoverage).toBe(0.5);
    expect(tokens.shader.skyTop).toBe("#abcdef"); // lowercased
  });

  it("is idempotent — re-parsing a normalised blob preserves the (nested) shader", () => {
    const raw = validExport();
    raw.cloudCoverage = 0.5;
    raw.skyTop = "#abcdef";
    const once = parseDesignTokens(raw).tokens;
    // Feed the NORMALISED output (shader nested) back in — the backend returns
    // this shape, and the frontend re-validates it before emitting CSS.
    const twice = parseDesignTokens(once).tokens;
    expect(twice.shader.cloudCoverage).toBe(0.5);
    expect(twice.shader.skyTop).toBe("#abcdef");
    expect(twice).toEqual(once);
  });
});

describe("parseDesignTokens — partial input", () => {
  it("fills missing groups from defaults", () => {
    const { tokens, errors } = parseDesignTokens({ cardRadius: 10 });
    expect(errors).toEqual([]); // missing keys are silently defaulted, not errors
    expect(tokens.cardRadius).toBe(10);
    expect(tokens.glass.card).toEqual(DESIGN_TOKENS_DEFAULTS.glass.card);
    expect(tokens.shader.cloudCoverage).toBe(SHADER_DEFAULTS.cloudCoverage);
  });

  it("fills a missing day/night half from defaults", () => {
    const { tokens } = parseDesignTokens({
      glass: { card: { day: { opacity: 0.9 } } },
    });
    expect(tokens.glass.card.day.opacity).toBe(0.9);
    expect(tokens.glass.card.night).toEqual(DESIGN_TOKENS_DEFAULTS.glass.card.night);
  });
});

describe("parseDesignTokens — clamping & coercion", () => {
  it("clamps out-of-range numbers silently (the bounded value is still applied)", () => {
    const { tokens, errors } = parseDesignTokens({
      glass: { card: { day: { opacity: 5 } } },
      cardRadius: 999,
    });
    expect(tokens.glass.card.day.opacity).toBe(1);
    expect(tokens.cardRadius).toBe(40);
    // clamping is a correction, not a rejection — only invalid-typed values are errors
    expect(errors).toEqual([]);
  });

  it("snaps boolean shader params to 0/1", () => {
    const a = parseDesignTokens({ animate: 0.3, autoDayNight: 0.8 });
    expect(a.tokens.shader.animate).toBe(0);
    expect(a.tokens.shader.autoDayNight).toBe(1);
  });

  it("rejects a non-numeric number field, keeping the default", () => {
    const { tokens, errors } = parseDesignTokens({ cardRadius: "huge" });
    expect(tokens.cardRadius).toBe(CARD_RADIUS_DEFAULT);
    expect(errors).toContain("cardRadius: invalid number, using default");
  });
});

describe("parseDesignTokens — colors & injection safety", () => {
  it("accepts rgb()/rgba() colours", () => {
    const { tokens, errors } = parseDesignTokens({
      glass: { card: { day: { tintTop: "rgb(10, 20, 30)", tintBottom: "rgba(1,2,3,0.5)" } } },
    });
    expect(errors).toEqual([]);
    expect(tokens.glass.card.day.tintTop).toBe("rgb(10, 20, 30)");
    expect(tokens.glass.card.day.tintBottom).toBe("rgba(1,2,3,0.5)");
  });

  it("rejects a CSS-injection attempt in a colour field", () => {
    const injection = "#fff; } body { display: none } .x {";
    const { tokens, errors } = parseDesignTokens({
      glass: { card: { day: { tintTop: injection } } },
    });
    expect(tokens.glass.card.day.tintTop).toBe(DESIGN_TOKENS_DEFAULTS.glass.card.day.tintTop);
    expect(errors.some((e) => e.includes("invalid color"))).toBe(true);
  });

  it("rejects a url()-based colour injection", () => {
    const { tokens } = parseDesignTokens({
      shader: undefined,
      backdrop: { backdrop: { day: { color: "url(https://evil.example/x.png)" } } },
    });
    expect(tokens.backdrop.backdrop.day.color).toBe(DESIGN_TOKENS_DEFAULTS.backdrop.backdrop.day.color);
  });

  it("rejects 3-digit hex (only #rrggbb is allowed)", () => {
    const { tokens } = parseDesignTokens({
      text: { primary: { day: { color: "#fff" } } },
    });
    expect(tokens.text.primary.day.color).toBe(DESIGN_TOKENS_DEFAULTS.text.primary.day.color);
  });
});

describe("parseDesignTokens — unknown keys & garbage", () => {
  it("drops unknown keys", () => {
    const { tokens } = parseDesignTokens({
      glass: { card: { day: { opacity: 0.5, bogusField: 123 }, bogusControl: {} } },
      bogusTopLevel: { a: 1 },
    });
    expect((tokens.glass.card.day as unknown as Record<string, unknown>).bogusField).toBeUndefined();
    expect((tokens.glass as Record<string, unknown>).bogusControl).toBeUndefined();
    expect((tokens as unknown as Record<string, unknown>).bogusTopLevel).toBeUndefined();
  });

  it("returns full defaults for invalid JSON string", () => {
    const { tokens, errors } = parseDesignTokens("{ not valid json");
    expect(tokens).toEqual(DESIGN_TOKENS_DEFAULTS);
    expect(errors).toEqual(["root: invalid JSON"]);
  });

  it("returns full defaults for non-object inputs", () => {
    for (const bad of [null, undefined, 42, true, [] as unknown]) {
      const { tokens } = parseDesignTokens(bad);
      expect(tokens.cardRadius).toBe(CARD_RADIUS_DEFAULT);
    }
  });

  it("rejects an unknown font, keeping the default", () => {
    const { tokens, errors } = parseDesignTokens({
      footer: { skytext: { day: { fontFamily: "Comic Sans MS" } } },
    });
    expect(tokens.footer.skytext.day.fontFamily).toBe(DESIGN_TOKENS_DEFAULTS.footer.skytext.day.fontFamily);
    expect(errors.some((e) => e.includes("unknown font"))).toBe(true);
  });
});
