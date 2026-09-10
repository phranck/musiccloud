import { describe, expect, it } from "vitest";
import { parseShortcodes } from "./markdown-shortcode-parser.js";
import { expandSiteVariables, SITE_VARIABLE_NAMES, SITE_VARIABLES, type SiteVariableValues } from "./site-variables.js";

const VALUES: SiteVariableValues = {
  freeRequestsPerMinute: 60,
  freeRequestsPerDay: 10_000,
  projectsPerAccount: 3,
  registrationsPerProject: 5,
  keylessRequestsPerMinute: 10,
  keylessRequestsPerDay: 500,
};

describe("expandSiteVariables", () => {
  it("puts a figure in place of its name", () => {
    expect(expandSiteVariables("Up to {freeRequestsPerMinute} a minute.", VALUES)).toBe("Up to 60 a minute.");
  });

  it("groups the thousands, so a five-digit figure is read at a glance", () => {
    expect(expandSiteVariables("{freeRequestsPerDay}", VALUES)).toBe("10,000");
  });

  it("expands every name in one text", () => {
    expect(expandSiteVariables("{projectsPerAccount} projects, {registrationsPerProject} registrations", VALUES)).toBe(
      "3 projects, 5 registrations",
    );
  });

  it("leaves a name nothing declares exactly as it was written", () => {
    expect(expandSiteVariables("A {madeUpName} and a {freeRequestsPerMinute}.", VALUES)).toBe(
      "A {madeUpName} and a 60.",
    );
  });

  it("leaves a key on a keyboard alone, since that is a different notation", () => {
    expect(expandSiteVariables("Press {{Esc}} to close.", VALUES)).toBe("Press {{Esc}} to close.");
  });

  it("leaves a text without braces untouched", () => {
    expect(expandSiteVariables("Nothing to expand here.", VALUES)).toBe("Nothing to expand here.");
  });

  it("expands inside a shortcode's attribute, since it runs before parsing", () => {
    const expanded = expandSiteVariables('[[pill:x note="up to {freeRequestsPerDay} a day"]]', VALUES);
    const [parsed] = parseShortcodes(expanded);

    expect(parsed.attributes.note).toBe("up to 10,000 a day");
  });

  it("expands in a shortcode's target too", () => {
    const expanded = expandSiteVariables("[[pill:{projectsPerAccount} projects]]", VALUES);
    const [parsed] = parseShortcodes(expanded);

    expect(parsed.target).toBe("3 projects");
  });
});

describe("SITE_VARIABLES", () => {
  it("lists every declared name, in declaration order", () => {
    expect(SITE_VARIABLE_NAMES).toEqual(Object.keys(SITE_VARIABLES));
  });

  it("gives every variable a label and an example the reference can show", () => {
    for (const name of SITE_VARIABLE_NAMES) {
      expect(SITE_VARIABLES[name].label, name).not.toBe("");
      expect(SITE_VARIABLES[name].example, name).not.toBe("");
    }
  });

  it("declares a value for every name, so none can be expanded to nothing", () => {
    // `SiteVariableValues` and `SITE_VARIABLES` are two lists of the same
    // names, kept apart because one is what an editor reads and the other is
    // what the backend fills in. This is what holds them together.
    for (const name of SITE_VARIABLE_NAMES) {
      expect(VALUES[name], name).toBeTypeOf("number");
    }
    expect(Object.keys(VALUES).sort()).toEqual([...SITE_VARIABLE_NAMES].sort());
  });
});
