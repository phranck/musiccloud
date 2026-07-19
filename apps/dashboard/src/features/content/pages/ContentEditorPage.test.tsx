import { ContentContext, type ContentPage } from "@musiccloud/shared";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ContentEditorPage } from "@/features/content/pages/ContentEditorPage";

const mocks = vi.hoisted(() => ({
  deletePage: vi.fn(),
  editor: vi.fn(),
  pageQuery: vi.fn(),
}));

vi.mock("@/components/ui/HeaderBackButton", () => ({
  HeaderBackButton: ({ label }: { label: string }) => <button type="button">{label}</button>,
}));

vi.mock("@/components/ui/MarkdownEditor", () => ({
  MarkdownEditor: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
    <textarea aria-label="Canonical body" value={value} onChange={(event) => onChange(event.target.value)} />
  ),
}));

vi.mock("@/components/ui/PageHeader", () => ({
  PageHeader: ({
    title,
    renderLeading,
    renderActions,
  }: {
    title: string;
    renderLeading?: () => React.ReactNode;
    renderActions?: () => React.ReactNode;
  }) => (
    <header>
      {renderLeading?.()}
      <h1>{title}</h1>
      {renderActions?.()}
    </header>
  ),
}));

vi.mock("@/features/content/hooks/useAdminContent", () => ({
  SystemOwnedContentPageError: class extends Error {},
  useAdminContentPage: () => mocks.pageQuery(),
  useDeleteContentPage: () => ({ isPending: false, mutate: mocks.deletePage }),
}));

vi.mock("@/features/content/hooks/useAdminNav", () => ({
  useAdminNavigationConfiguration: () => ({ data: { entries: [] } }),
}));

vi.mock("@/features/content/pages/PagePublishingEditor", () => ({
  PagePublishingEditor: () => null,
}));

vi.mock("@/features/content/state/PagesEditorContext", () => ({
  usePagesEditor: () => mocks.editor(),
}));

const page: ContentPage = {
  id: "page-privacy",
  slug: "privacy",
  contextMask: ContentContext.Frontend,
  publications: [
    {
      context: ContentContext.Frontend,
      path: "/privacy",
      status: "published",
      templateKey: "frontend-default",
    },
  ],
  title: "Privacy Policy",
  status: "published",
  showTitle: true,
  titleAlignment: "left",
  pageType: "default",
  displayMode: "fullscreen",
  overlayWidth: "regular",
  contentCardStyle: "default",
  createdByUsername: "owner",
  updatedByUsername: "owner",
  createdAt: "2026-07-19T00:00:00.000Z",
  updatedAt: "2026-07-19T01:00:00.000Z",
  content: "Canonical English body",
  segments: [],
  markdownValidation: { ok: true, errors: [] },
};

describe("ContentEditorPage canonical editorial fields", () => {
  const dispatch = {
    meta: vi.fn(),
    content: vi.fn(),
    publications: vi.fn(),
    segments: vi.fn(),
    sidebar: vi.fn(),
  };

  beforeEach(() => {
    Object.values(dispatch).forEach((fn) => fn.mockReset());
    mocks.pageQuery.mockReturnValue({ data: page, isLoading: false, isError: false, error: null });
    mocks.editor.mockReturnValue({
      meta: { pages: {} },
      content: { pages: {} },
      publications: { pages: {} },
      segments: { byOwner: {} },
      sidebar: { initial: [], current: [] },
      dispatch,
    });
  });

  it("loads and edits only the canonical title and body", async () => {
    render(
      <MemoryRouter initialEntries={["/pages/privacy"]}>
        <Routes>
          <Route path="/pages/:slug" element={<ContentEditorPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByDisplayValue("Privacy Policy")).toBeTruthy();
    expect(await screen.findByDisplayValue("Canonical English body")).toBeTruthy();
    expect(screen.queryByText("Translations")).toBeNull();
    expect(screen.queryByRole("tab")).toBeNull();

    fireEvent.change(screen.getByDisplayValue("Privacy Policy"), { target: { value: "Privacy" } });
    fireEvent.change(screen.getByDisplayValue("Canonical English body"), {
      target: { value: "Updated canonical body" },
    });

    expect(dispatch.meta).toHaveBeenCalledWith({
      type: "set-field",
      slug: "privacy",
      field: "title",
      value: "Privacy",
    });
    expect(dispatch.content).toHaveBeenCalledWith({
      type: "set",
      slug: "privacy",
      value: "Updated canonical body",
    });
  });
});
