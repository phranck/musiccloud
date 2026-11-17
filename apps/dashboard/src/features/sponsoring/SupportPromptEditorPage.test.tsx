import {
  ContentContext,
  type ContentPageSummary,
  ContentStatus,
  SUPPORT_PROMPT_DEFAULTS,
  type SupportPrompt,
} from "@musiccloud/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchSupportPrompts: vi.fn(),
  createSupportPrompt: vi.fn(),
  updateSupportPrompt: vi.fn(),
  deleteSupportPrompt: vi.fn(),
  pages: [] as unknown[],
}));

vi.mock("./api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./api")>()),
  fetchSupportPrompts: mocks.fetchSupportPrompts,
  createSupportPrompt: mocks.createSupportPrompt,
  updateSupportPrompt: mocks.updateSupportPrompt,
  deleteSupportPrompt: mocks.deleteSupportPrompt,
}));

vi.mock("@/features/content/hooks/useAdminContent", () => ({
  useContentPages: () => ({ data: mocks.pages }),
}));

vi.mock("@/components/ui/MarkdownEditor", () => ({
  MarkdownEditor: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
    <textarea aria-label="Prompt content" value={value} onChange={(event) => onChange(event.target.value)} />
  ),
}));

// The real header hands its actions to the layout's slot, which this test does not mount.
vi.mock("@/components/ui/PageHeader", () => ({
  PageHeader: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

import { dashboardCopy } from "@/copy/dashboard";
import { SupportPromptEditorPage } from "./SupportPromptEditorPage";

const text = dashboardCopy.sponsoring.supportPrompts;
const common = dashboardCopy.common;

/** Shown in place of the list, so a test can tell the editor navigated back to it. */
const LIST_MARKER = "support prompt list";

/** A stored prompt. */
const STORED: SupportPrompt = {
  ...SUPPORT_PROMPT_DEFAULTS,
  id: "p1",
  name: "Share page ask",
  slot: "share-page",
  content: "Thank you for {views share|shares}.",
  buttonLabel: "Support",
  published: true,
  updatedAt: "2026-08-01T00:00:00.000Z",
};

/**
 * A page summary with one Frontend publication.
 *
 * @param slug - The page's slug.
 * @param title - The page's title.
 * @param path - Where the Frontend publication lives.
 * @param status - The Frontend publication's status.
 * @returns The summary.
 */
function page(slug: string, title: string, path: string, status: ContentStatus): ContentPageSummary {
  return {
    slug,
    title,
    publications: [{ context: ContentContext.Frontend, path, status, templateKey: "frontend-default" }],
  } as ContentPageSummary;
}

/**
 * Renders the editor at an address, with the list's address answering with a marker.
 *
 * @param promptId - The address segment, a prompt id or `new`.
 */
function renderEditor(promptId: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/sponsoring/support-prompts/${promptId}`]}>
        <Routes>
          <Route path="/sponsoring/support-prompts" element={<p>{LIST_MARKER}</p>} />
          <Route path="/sponsoring/support-prompts/:promptId" element={<SupportPromptEditorPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("SupportPromptEditorPage", () => {
  beforeEach(() => {
    for (const mock of [
      mocks.fetchSupportPrompts,
      mocks.createSupportPrompt,
      mocks.updateSupportPrompt,
      mocks.deleteSupportPrompt,
    ]) {
      mock.mockReset();
    }
    mocks.fetchSupportPrompts.mockResolvedValue([STORED]);
    mocks.pages = [
      page("support-me", "Support me", "/support-me", ContentStatus.Published),
      page("draft-page", "Draft page", "/draft-page", ContentStatus.Draft),
    ];
  });

  it("creates a new prompt from the shared defaults, named and placed in the first slot", async () => {
    mocks.createSupportPrompt.mockResolvedValue({ ...STORED, id: "p9" });
    renderEditor("new");

    expect(((await screen.findByLabelText(text.nameLabel)) as HTMLInputElement).value).toBe(text.newPrompt);
    expect(screen.queryByRole("button", { name: common.delete })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: common.save }));

    await waitFor(() =>
      expect(mocks.createSupportPrompt).toHaveBeenCalledWith({
        ...SUPPORT_PROMPT_DEFAULTS,
        name: text.newPrompt,
        slot: "share-page",
      }),
    );
  });

  it("saves a stored prompt with the edited fields", async () => {
    mocks.updateSupportPrompt.mockImplementation(async (id, input) => ({ ...STORED, ...input, id }));
    renderEditor("p1");

    const name = (await screen.findByLabelText(text.nameLabel)) as HTMLInputElement;
    expect(name.value).toBe(STORED.name);
    fireEvent.change(name, { target: { value: "Renamed ask" } });
    fireEvent.change(screen.getByLabelText(text.thresholdLabel), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: common.save }));

    const { id: _id, updatedAt: _updatedAt, ...fields } = STORED;
    await waitFor(() =>
      expect(mocks.updateSupportPrompt).toHaveBeenCalledWith("p1", { ...fields, name: "Renamed ask", threshold: 5 }),
    );
    expect(await screen.findByText(common.saved)).not.toBeNull();
  });

  it("offers only pages published on the site as the button's destination", async () => {
    renderEditor("p1");

    fireEvent.click(await screen.findByRole("button", { name: text.buttonHrefLabel }));

    expect(screen.getByRole("option", { name: "Support me · /support-me" })).not.toBeNull();
    expect(screen.queryByRole("option", { name: "Draft page · /draft-page" })).toBeNull();
  });

  it("asks before deleting a prompt, and returns to the list afterwards", async () => {
    mocks.deleteSupportPrompt.mockResolvedValue({ message: "Deleted" });
    renderEditor("p1");

    await screen.findByLabelText(text.nameLabel);
    fireEvent.click(screen.getByRole("button", { name: common.delete }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(text.deleteMessage)).not.toBeNull();
    expect(mocks.deleteSupportPrompt).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: common.delete }));
    await waitFor(() => expect(mocks.deleteSupportPrompt).toHaveBeenCalledWith("p1"));
    expect(await screen.findByText(LIST_MARKER)).not.toBeNull();
  });
});
