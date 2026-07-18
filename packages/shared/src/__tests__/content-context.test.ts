import { describe, expect, it } from "vitest";
import {
  activeContentContexts,
  activeNavigationAreas,
  ContentContext,
  expectedNavigationPlacements,
  hasAllContextBits,
  isValidContentContextMask,
  isValidNavigationAreaMask,
  NavigationArea,
} from "../content-context.js";

describe("content context masks", () => {
  it("accepts exactly the non-empty combinations of known context bits", () => {
    expect(isValidContentContextMask(0)).toBe(false);
    expect(isValidContentContextMask(ContentContext.Frontend)).toBe(true);
    expect(isValidContentContextMask(ContentContext.DeveloperPortal)).toBe(true);
    expect(isValidContentContextMask(ContentContext.Frontend | ContentContext.DeveloperPortal)).toBe(true);
    expect(isValidContentContextMask(4)).toBe(false);
    expect(isValidContentContextMask(-1)).toBe(false);
    expect(isValidContentContextMask(1.5)).toBe(false);
    expect(isValidContentContextMask(2 ** 32)).toBe(false);
    expect(isValidContentContextMask(2 ** 32 + ContentContext.Frontend)).toBe(false);
  });

  it("expands active contexts in canonical order", () => {
    expect(activeContentContexts(ContentContext.Frontend | ContentContext.DeveloperPortal)).toEqual([
      ContentContext.Frontend,
      ContentContext.DeveloperPortal,
    ]);
  });

  it("rejects invalid masks when expanding active contexts", () => {
    expect(() => activeContentContexts(0)).toThrow("Invalid content context mask");
    expect(() => activeContentContexts(4)).toThrow("Invalid content context mask");
    expect(() => activeContentContexts(2 ** 32)).toThrow("Invalid content context mask");
  });

  it("checks whether every requested context bit is active", () => {
    const both = ContentContext.Frontend | ContentContext.DeveloperPortal;

    expect(hasAllContextBits(both, ContentContext.Frontend)).toBe(true);
    expect(hasAllContextBits(both, ContentContext.DeveloperPortal)).toBe(true);
    expect(hasAllContextBits(ContentContext.Frontend, ContentContext.DeveloperPortal)).toBe(false);
  });

  it("rejects invalid masks when checking contained context bits", () => {
    expect(() => hasAllContextBits(0, ContentContext.Frontend)).toThrow("Invalid content context mask");
    expect(() => hasAllContextBits(ContentContext.Frontend, 4)).toThrow("Invalid required context mask");
  });
});

describe("navigation area masks", () => {
  it("accepts exactly the non-empty combinations of known area bits", () => {
    expect(isValidNavigationAreaMask(0)).toBe(false);
    expect(isValidNavigationAreaMask(NavigationArea.Main)).toBe(true);
    expect(isValidNavigationAreaMask(NavigationArea.Footer)).toBe(true);
    expect(isValidNavigationAreaMask(NavigationArea.Main | NavigationArea.Footer)).toBe(true);
    expect(isValidNavigationAreaMask(4)).toBe(false);
    expect(isValidNavigationAreaMask(-1)).toBe(false);
    expect(isValidNavigationAreaMask(1.5)).toBe(false);
  });

  it("expands active navigation areas in canonical order", () => {
    expect(activeNavigationAreas(NavigationArea.Main | NavigationArea.Footer)).toEqual([
      NavigationArea.Main,
      NavigationArea.Footer,
    ]);
  });

  it("rejects invalid masks when expanding active navigation areas", () => {
    expect(() => activeNavigationAreas(0)).toThrow("Invalid navigation area mask");
    expect(() => activeNavigationAreas(4)).toThrow("Invalid navigation area mask");
  });

  it("expands the exact context and area Cartesian product in canonical order", () => {
    expect(
      expectedNavigationPlacements(ContentContext.Frontend | ContentContext.DeveloperPortal, NavigationArea.Footer),
    ).toEqual([
      { context: ContentContext.Frontend, area: NavigationArea.Footer },
      { context: ContentContext.DeveloperPortal, area: NavigationArea.Footer },
    ]);

    expect(
      expectedNavigationPlacements(
        ContentContext.Frontend | ContentContext.DeveloperPortal,
        NavigationArea.Main | NavigationArea.Footer,
      ),
    ).toEqual([
      { context: ContentContext.Frontend, area: NavigationArea.Main },
      { context: ContentContext.Frontend, area: NavigationArea.Footer },
      { context: ContentContext.DeveloperPortal, area: NavigationArea.Main },
      { context: ContentContext.DeveloperPortal, area: NavigationArea.Footer },
    ]);
  });
});
