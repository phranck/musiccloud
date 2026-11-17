import { SUPPORT_PROMPT_DEFAULTS, SUPPORT_PROMPT_LIMIT_DEFAULTS, type SupportPrompt } from "@musiccloud/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchSupportPrompts: vi.fn(),
  fetchSupportPromptLimits: vi.fn(),
  updateSupportPromptLimits: vi.fn(),
}));

vi.mock("./api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./api")>()),
  fetchSupportPrompts: mocks.fetchSupportPrompts,
  fetchSupportPromptLimits: mocks.fetchSupportPromptLimits,
  updateSupportPromptLimits: mocks.updateSupportPromptLimits,
}));

// The real header hands its actions to the layout's slot, which this test does not mount.
vi.mock("@/components/ui/PageHeader", () => ({
  PageHeader: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

import { dashboardCopy } from "@/copy/dashboard";
import { SupportPromptsPage } from "./SupportPromptsPage";

const text = dashboardCopy.sponsoring.supportPrompts;

/** The moment the page judges the states against: 2026-08-22, noon UTC. */
const NOW = new Date("2026-08-22T12:00:00.000Z");

/** A published prompt without a window, so it is live. */
const LIVE: SupportPrompt = {
  ...SUPPORT_PROMPT_DEFAULTS,
  id: "p1",
  name: "Share page ask",
  slot: "share-page",
  published: true,
  updatedAt: "2026-08-01T00:00:00.000Z",
};

/** A published prompt whose window opens after {@link NOW}, so it is scheduled. */
const SCHEDULED: SupportPrompt = {
  ...LIVE,
  id: "p2",
  name: "Christmas ask",
  slot: "landing-page",
  startsAt: "2026-12-01",
};

/** An unpublished prompt, so it is a draft. */
const DRAFT: SupportPrompt = { ...LIVE, id: "p3", name: "Unfinished ask", published: false };

/** The limits as stored, which differ from the defaults. */
const STORED_LIMITS = { ...SUPPORT_PROMPT_LIMIT_DEFAULTS, maxShown: 5 };

/** Renders the page with a fresh query client inside a router. */
function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <SupportPromptsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/**
 * The table row that names a prompt.
 *
 * @param name - The prompt's name.
 * @returns The row.
 */
async function rowOf(name: string): Promise<HTMLElement> {
  return (await screen.findByText(name)).closest("tr") as HTMLElement;
}

describe("SupportPromptsPage", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    localStorage.clear();
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.fetchSupportPrompts.mockResolvedValue([LIVE, SCHEDULED, DRAFT]);
    mocks.fetchSupportPromptLimits.mockResolvedValue(STORED_LIMITS);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("lists each prompt with its slot, threshold, window and what it does today", async () => {
    renderPage();

    const live = await rowOf("Share page ask");
    expect(within(live).getByText(text.slots["share-page"])).not.toBeNull();
    expect(within(live).getByText(String(SUPPORT_PROMPT_DEFAULTS.threshold))).not.toBeNull();
    expect(within(live).getByText(text.windowNone)).not.toBeNull();
    expect(within(live).getByText(text.states.live).className).toContain("mc-status-badge--success");

    const scheduled = await rowOf("Christmas ask");
    expect(within(scheduled).getByText(text.slots["landing-page"])).not.toBeNull();
    expect(within(scheduled).getByText("2026-12-01 until …")).not.toBeNull();
    expect(within(scheduled).getByText(text.states.scheduled).className).toContain("mc-status-badge--neutral");

    const draft = await rowOf("Unfinished ask");
    expect(within(draft).getByText(text.states.draft).className).toContain("mc-status-badge--neutral");
  });

  it("says there is no prompt yet while the list is empty", async () => {
    mocks.fetchSupportPrompts.mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText(text.emptyTitle)).not.toBeNull();
    expect(screen.getByText(text.emptyHint)).not.toBeNull();
  });

  it("keeps the limits closed until opened, remembers that, and saves the edited values", async () => {
    mocks.updateSupportPromptLimits.mockImplementation(async (next) => next);
    renderPage();
    await rowOf("Share page ask");
    const save = screen.getByRole("button", { name: dashboardCopy.common.save }) as HTMLButtonElement;
    // Closed, the limits stay in the document so they can animate, but out of reach.
    expect(screen.getByLabelText(text.maxShownLabel).closest("[inert]")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: text.limitsTitle }));
    expect(localStorage.getItem("support-prompts-limits-open")).toBe("true");
    const maxShown = (await screen.findByLabelText(text.maxShownLabel)) as HTMLInputElement;
    expect(maxShown.closest("[inert]")).toBeNull();
    await waitFor(() => expect(maxShown.value).toBe(String(STORED_LIMITS.maxShown)));
    expect(save.disabled).toBe(true);

    fireEvent.change(maxShown, { target: { value: "7" } });
    expect(save.disabled).toBe(false);
    fireEvent.click(save);

    await waitFor(() => expect(mocks.updateSupportPromptLimits).toHaveBeenCalled());
    expect(mocks.updateSupportPromptLimits.mock.calls[0]?.[0]).toEqual({ ...STORED_LIMITS, maxShown: 7 });
    await waitFor(() => expect(save.disabled).toBe(true));
  });

  it("names the server's reason when the limits are refused", async () => {
    localStorage.setItem("support-prompts-limits-open", "true");
    mocks.updateSupportPromptLimits.mockRejectedValue(
      Object.assign(new Error("The request is invalid. (MC-REQ-0001)"), { status: 400, errorId: "err-4" }),
    );
    renderPage();

    const maxShown = (await screen.findByLabelText(text.maxShownLabel)) as HTMLInputElement;
    fireEvent.change(maxShown, { target: { value: "7" } });
    fireEvent.click(screen.getByRole("button", { name: dashboardCopy.common.save }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "The request is invalid. (MC-REQ-0001) Error ID: err-4",
    );
  });
});
