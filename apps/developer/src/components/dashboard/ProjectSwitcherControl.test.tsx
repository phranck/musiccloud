import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProjectSwitcherControl } from "./ProjectSwitcherControl";

const PROJECTS = [
  { id: "project-1", displayName: "My Music App" },
  { id: "project-2", displayName: "Second app" },
];

describe("ProjectSwitcherControl", () => {
  it("associates its label with the control, so the choice is announced", () => {
    const html = renderToStaticMarkup(
      <ProjectSwitcherControl projects={PROJECTS} selectedId="project-2" onSelect={() => undefined} />,
    );

    const selectId = html.match(/<select id="([^"]+)"/)?.[1];
    expect(selectId).toBeTruthy();
    expect(html).toContain(`<label for="${selectId}"`);
  });

  it("is a native select, so it is operable by keyboard without reimplementing one", () => {
    const html = renderToStaticMarkup(
      <ProjectSwitcherControl projects={PROJECTS} selectedId="project-1" onSelect={() => undefined} />,
    );

    expect(html).toContain("<select ");
    expect(html).not.toContain("role=");
  });

  it("offers every project and marks the one being shown", () => {
    const html = renderToStaticMarkup(
      <ProjectSwitcherControl projects={PROJECTS} selectedId="project-2" onSelect={() => undefined} />,
    );

    expect(html).toContain('value="project-1"');
    expect(html).toContain('value="project-2"');
    expect(html).toContain("My Music App");
    expect(html).toContain("Second app");
    expect(html).toMatch(/<option [^>]*selected[^>]*value="project-2"|<option [^>]*value="project-2"[^>]*selected/);
  });
});
