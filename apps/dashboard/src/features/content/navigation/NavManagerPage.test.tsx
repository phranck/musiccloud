import {
  ContentContext,
  type ContentPageSummary,
  NavigationArea,
  type NavigationConfiguration,
  NavigationTargetKind,
} from "@musiccloud/shared";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { moveNavigationPlacement, NavManagerPage } from "@/features/content/navigation/NavManagerPage";

const mocks = vi.hoisted(() => ({
  configurationQuery: vi.fn(),
  pagesQuery: vi.fn(),
  saveConfiguration: vi.fn(),
}));

vi.mock("@/components/ui/PageHeader", () => ({
  PageHeader: ({ title, children }: { title: string; children: React.ReactNode }) => (
    <header>
      <h1>{title}</h1>
      {children}
    </header>
  ),
}));

vi.mock("@/features/content/hooks/useAdminContent", () => ({
  useContentPages: () => mocks.pagesQuery(),
}));

vi.mock("@/features/content/hooks/useAdminNav", () => ({
  useAdminNavigationConfiguration: () => mocks.configurationQuery(),
  useSaveNavigationConfiguration: () => ({
    isPending: false,
    mutateAsync: mocks.saveConfiguration,
  }),
}));

function pageSummary(overrides: Pick<ContentPageSummary, "id" | "slug" | "title" | "contextMask">): ContentPageSummary {
  return {
    ...overrides,
    publications: [],
    status: "draft",
    showTitle: true,
    titleAlignment: "left",
    pageType: "default",
    displayMode: "embossed",
    overlayWidth: "regular",
    contentCardStyle: "default",
    createdByUsername: null,
    updatedByUsername: null,
    createdAt: "2026-07-18T00:00:00.000Z",
    updatedAt: null,
  };
}

const pages: ContentPageSummary[] = [
  pageSummary({
    id: "about",
    slug: "about",
    title: "About",
    contextMask: ContentContext.Frontend,
  }),
  pageSummary({
    id: "privacy",
    slug: "privacy",
    title: "Privacy",
    contextMask: ContentContext.Frontend | ContentContext.DeveloperPortal,
  }),
  pageSummary({
    id: "terms",
    slug: "terms",
    title: "Terms",
    contextMask: ContentContext.Frontend | ContentContext.DeveloperPortal,
  }),
  pageSummary({
    id: "portal-only",
    slug: "portal-only",
    title: "Portal only",
    contextMask: ContentContext.DeveloperPortal,
  }),
];

const configuration: NavigationConfiguration = {
  entries: [
    {
      id: 1,
      targetKind: NavigationTargetKind.Page,
      pageId: "about",
      pageSlug: "about",
      pageTitle: "About",
      url: null,
      systemKey: null,
      target: "_self",
      label: "About",
      contextMask: ContentContext.Frontend,
      areaMask: NavigationArea.Main,
      placements: [{ context: ContentContext.Frontend, area: NavigationArea.Main, position: 0 }],
      canonicalRoute: null,
      behavior: null,
    },
    {
      id: 2,
      targetKind: NavigationTargetKind.Page,
      pageId: "privacy",
      pageSlug: "privacy",
      pageTitle: "Privacy",
      url: null,
      systemKey: null,
      target: "_self",
      label: "Privacy",
      contextMask: ContentContext.Frontend | ContentContext.DeveloperPortal,
      areaMask: NavigationArea.Main | NavigationArea.Footer,
      placements: [
        { context: ContentContext.Frontend, area: NavigationArea.Main, position: 1 },
        { context: ContentContext.Frontend, area: NavigationArea.Footer, position: 0 },
        { context: ContentContext.DeveloperPortal, area: NavigationArea.Main, position: 2 },
        { context: ContentContext.DeveloperPortal, area: NavigationArea.Footer, position: 1 },
      ],
      canonicalRoute: null,
      behavior: null,
    },
    {
      id: 3,
      targetKind: NavigationTargetKind.Page,
      pageId: "terms",
      pageSlug: "terms",
      pageTitle: "Terms",
      url: null,
      systemKey: null,
      target: "_self",
      label: "Terms",
      contextMask: ContentContext.Frontend | ContentContext.DeveloperPortal,
      areaMask: NavigationArea.Footer,
      placements: [
        { context: ContentContext.Frontend, area: NavigationArea.Footer, position: 1 },
        { context: ContentContext.DeveloperPortal, area: NavigationArea.Footer, position: 0 },
      ],
      canonicalRoute: null,
      behavior: null,
    },
    {
      id: 4,
      targetKind: NavigationTargetKind.System,
      pageId: null,
      pageSlug: null,
      pageTitle: null,
      url: null,
      systemKey: "docs",
      target: "_self",
      label: "Documentation",
      contextMask: ContentContext.DeveloperPortal,
      areaMask: NavigationArea.Main | NavigationArea.Footer,
      placements: [
        { context: ContentContext.DeveloperPortal, area: NavigationArea.Main, position: 0 },
        { context: ContentContext.DeveloperPortal, area: NavigationArea.Footer, position: 2 },
      ],
      canonicalRoute: "/docs",
      behavior: "navigate",
    },
    {
      id: 5,
      targetKind: NavigationTargetKind.System,
      pageId: null,
      pageSlug: null,
      pageTitle: null,
      url: null,
      systemKey: "api-reference",
      target: "_self",
      label: "API Reference",
      contextMask: ContentContext.DeveloperPortal,
      areaMask: NavigationArea.Main,
      placements: [{ context: ContentContext.DeveloperPortal, area: NavigationArea.Main, position: 1 }],
      canonicalRoute: "/docs/api",
      behavior: "navigate",
    },
    {
      id: 6,
      targetKind: NavigationTargetKind.System,
      pageId: null,
      pageSlug: null,
      pageTitle: null,
      url: null,
      systemKey: "search",
      target: "_self",
      label: "Search",
      contextMask: ContentContext.DeveloperPortal,
      areaMask: NavigationArea.Footer,
      placements: [{ context: ContentContext.DeveloperPortal, area: NavigationArea.Footer, position: 3 }],
      canonicalRoute: "/docs/api?search=1",
      behavior: "open-api-search",
    },
  ],
};

function renderPage() {
  return render(<NavManagerPage />);
}

function placementNames(listName: string) {
  const list = screen.getByRole("list", { name: listName });
  return within(list)
    .getAllByRole("listitem")
    .map((item) => item.getAttribute("aria-label"));
}

describe("NavManagerPage", () => {
  beforeAll(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
  });

  afterAll(() => vi.unstubAllGlobals());

  beforeEach(() => {
    mocks.configurationQuery.mockReturnValue({
      data: configuration,
      error: null,
      isError: false,
      isLoading: false,
    });
    mocks.pagesQuery.mockReturnValue({ data: pages, error: null, isError: false, isLoading: false });
    mocks.saveConfiguration.mockReset();
    mocks.saveConfiguration.mockResolvedValue(configuration);
  });

  it("renders one editor with four independently ordered placement lists and protected system targets", () => {
    renderPage();

    expect(placementNames("Frontend Main")).toEqual(["About", "Privacy"]);
    expect(placementNames("Frontend Footer")).toEqual(["Privacy", "Terms"]);
    expect(placementNames("Developer Portal Main")).toEqual(["Documentation", "API Reference", "Privacy"]);
    expect(placementNames("Developer Portal Footer")).toEqual(["Terms", "Privacy", "Documentation", "Search"]);

    expect(screen.getAllByText("System target").length).toBeGreaterThanOrEqual(3);
    expect(screen.getAllByText("/docs").length).toBeGreaterThan(0);
    expect(screen.getAllByText("/docs/api").length).toBeGreaterThan(0);
    expect(screen.queryByDisplayValue("/docs")).toBeNull();
    expect(screen.queryByText("Login")).toBeNull();
    expect(screen.queryByText("Account")).toBeNull();

    const docsRow = within(screen.getByRole("list", { name: "Developer Portal Main" })).getByRole("listitem", {
      name: "Documentation",
    });
    expect((within(docsRow).getByRole("checkbox", { name: "Frontend" }) as HTMLInputElement).disabled).toBe(true);
    expect((within(docsRow).getByRole("checkbox", { name: "Developer Portal" }) as HTMLInputElement).disabled).toBe(
      true,
    );

    expect(within(docsRow).queryByRole("button", { name: "Translations" })).toBeNull();
  });

  it("reorders only the selected concrete placement list", () => {
    const moved = moveNavigationPlacement(
      configuration.entries,
      ContentContext.DeveloperPortal,
      NavigationArea.Footer,
      2,
      4,
    );
    const position = (entryId: number, context: number, area: number) =>
      moved
        .find((entry) => entry.id === entryId)
        ?.placements.find((placement) => placement.context === context && placement.area === area)?.position;

    expect(position(2, ContentContext.DeveloperPortal, NavigationArea.Footer)).toBe(2);
    expect(position(4, ContentContext.DeveloperPortal, NavigationArea.Footer)).toBe(1);
    expect(position(2, ContentContext.DeveloperPortal, NavigationArea.Main)).toBe(2);
    expect(position(4, ContentContext.DeveloperPortal, NavigationArea.Main)).toBe(0);
    expect(position(2, ContentContext.Frontend, NavigationArea.Footer)).toBe(0);
  });

  it("filters Page targets by the selected entry contexts", () => {
    renderPage();

    const addEditor = screen.getByRole("group", { name: "Add navigation item" });
    fireEvent.click(within(addEditor).getByRole("checkbox", { name: "Developer Portal" }));
    fireEvent.click(within(addEditor).getByRole("button", { name: "Page target" }));

    expect(within(addEditor).getByText("Privacy")).toBeTruthy();
    expect(within(addEditor).getByText("Terms")).toBeTruthy();
    expect(within(addEditor).queryByText("About")).toBeNull();
    expect(within(addEditor).queryByText("Portal only")).toBeNull();
  });

  it("prevents arbitrary Docs URLs from being added", () => {
    renderPage();

    const addEditor = screen.getByRole("group", { name: "Add navigation item" });
    fireEvent.click(within(addEditor).getByRole("button", { name: "URL" }));
    fireEvent.change(within(addEditor).getByPlaceholderText("https://… or /path"), { target: { value: "/docs" } });

    expect(within(addEditor).getByText("Documentation routes are system-owned.")).toBeTruthy();
    expect((within(addEditor).getByRole("button", { name: "Add" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("prevents unsafe URL targets before save", () => {
    renderPage();

    const addEditor = screen.getByRole("group", { name: "Add navigation item" });
    fireEvent.click(within(addEditor).getByRole("button", { name: "URL" }));
    fireEvent.change(within(addEditor).getByPlaceholderText("https://… or /path"), {
      target: { value: "javascript:alert(1)" },
    });

    const urlInput = within(addEditor).getByPlaceholderText("https://… or /path");
    expect(within(addEditor).getByText("Enter a safe URL or relative path.")).toBeTruthy();
    expect(urlInput.getAttribute("aria-invalid")).toBe("true");
    expect(document.getElementById(urlInput.getAttribute("aria-describedby")!)).toBeTruthy();
    expect((within(addEditor).getByRole("button", { name: "Add" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("waits for Page targets before enabling the editor", () => {
    mocks.pagesQuery.mockReturnValue({ data: undefined, error: null, isError: false, isLoading: true });
    const view = renderPage();

    expect(screen.getByText("Loading…")).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Frontend Main" })).toBeNull();

    mocks.pagesQuery.mockReturnValue({ data: pages, error: null, isError: false, isLoading: false });
    view.rerender(<NavManagerPage />);

    expect(screen.getByRole("list", { name: "Frontend Main" })).toBeTruthy();
  });

  it("shows the safe message and errorId when initial loading fails", () => {
    const error = Object.assign(new Error("Navigation load failed"), { errorId: "nav-load-error-72" });
    mocks.configurationQuery.mockReturnValue({ data: undefined, error, isError: true, isLoading: false });

    renderPage();

    expect(screen.getByRole("alert").textContent).toContain("Navigation load failed");
    expect(screen.getByRole("alert").textContent).toContain("nav-load-error-72");
    expect(screen.queryByText("Loading…")).toBeNull();
  });

  it("shows Page target loading errors instead of an empty selector", () => {
    const error = Object.assign(new Error("Page targets failed"), { errorId: "page-target-error-72" });
    mocks.pagesQuery.mockReturnValue({ data: undefined, error, isError: true, isLoading: false });

    renderPage();

    expect(screen.getByRole("alert").textContent).toContain("Page targets failed");
    expect(screen.getByRole("alert").textContent).toContain("page-target-error-72");
    expect(screen.queryByRole("list", { name: "Frontend Main" })).toBeNull();
  });

  it("adopts refreshed server data only while the draft is clean", () => {
    const refreshed = {
      entries: configuration.entries.map((entry) =>
        entry.id === 2 ? { ...entry, label: "Privacy from server" } : entry,
      ),
    } satisfies NavigationConfiguration;
    const view = renderPage();

    mocks.configurationQuery.mockReturnValue({ data: refreshed, error: null, isError: false, isLoading: false });
    view.rerender(<NavManagerPage />);
    expect(screen.getAllByDisplayValue("Privacy from server")).toHaveLength(4);

    fireEvent.change(screen.getAllByDisplayValue("Privacy from server")[0]!, {
      target: { value: "Privacy local draft" },
    });
    mocks.configurationQuery.mockReturnValue({ data: configuration, error: null, isError: false, isLoading: false });
    view.rerender(<NavManagerPage />);

    expect(screen.getAllByDisplayValue("Privacy local draft")).toHaveLength(4);
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("retains the dirty draft and exposes errorId when the atomic save fails", async () => {
    const error = Object.assign(new Error("Navigation save failed"), { errorId: "nav-error-72" });
    mocks.saveConfiguration.mockRejectedValue(error);
    renderPage();

    const privacyLabels = screen.getAllByDisplayValue("Privacy") as HTMLInputElement[];
    fireEvent.change(privacyLabels[0], { target: { value: "Privacy policy" } });
    expect(screen.getAllByDisplayValue("Privacy policy")).toHaveLength(4);

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.getByText("Navigation save failed")).toBeTruthy());
    expect(screen.getByText("nav-error-72")).toBeTruthy();
    expect(screen.getAllByDisplayValue("Privacy policy")).toHaveLength(4);
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("retains edits made while an atomic save is in flight", async () => {
    let resolveSave!: (value: NavigationConfiguration) => void;
    mocks.saveConfiguration.mockReturnValue(
      new Promise<NavigationConfiguration>((resolve) => {
        resolveSave = resolve;
      }),
    );
    renderPage();

    fireEvent.change(screen.getAllByDisplayValue("Privacy")[0]!, { target: { value: "Privacy before save" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    fireEvent.change(screen.getAllByDisplayValue("Privacy before save")[0]!, {
      target: { value: "Privacy after save started" },
    });

    await act(async () => resolveSave(configuration));

    expect(screen.getAllByDisplayValue("Privacy after save started")).toHaveLength(4);
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByText("Saved")).toBeNull();
  });
});
