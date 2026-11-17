import { type PublicSupportPrompt, SUPPORT_PROMPT_LIMIT_DEFAULTS } from "@musiccloud/shared";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const signalMocks = vi.hoisted(() => ({ sendMusicSignal: vi.fn() }));
vi.mock("@/lib/analytics/umami", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/analytics/umami")>()),
  sendMusicSignal: signalMocks.sendMusicSignal,
}));

import { SupportPromptSignal } from "@/lib/analytics/umami";
import { RESOLVED_LINKS_STORAGE_KEY } from "@/lib/support/resolved-links";
import { parseStore, SUPPORT_PROMPT_STORAGE_KEY } from "@/lib/support/support-prompt-store";
import { SupportPromptSlot } from "./SupportPromptSlot";

/** A prompt shown from the third opened share page on, with an invitation. */
const PROMPT: PublicSupportPrompt = {
  id: "p1",
  name: "Third share",
  slot: "share-page",
  html: "<p>You opened {views share|shares}.</p>",
  buttonLabel: "Support musiccloud",
  buttonHref: "/support-me",
  buttonAlignment: "trailing",
  threshold: 3,
  thresholdBasis: "opened",
  priority: 0,
};

/** The slot's data as a share page receives it. */
const DATA = {
  prompts: [PROMPT],
  limits: SUPPORT_PROMPT_LIMIT_DEFAULTS,
  devAlwaysShow: false,
  liveIds: [PROMPT.id],
};

/** What the analytics events of {@link PROMPT} carry, and nothing else. */
const EVENT_DATA = { prompt: PROMPT.name, id: PROMPT.id, slot: "share-page" };

/**
 * Opens one share page, which mounts the slot as the share page does.
 *
 * @param shareId - The share page's short id.
 */
function openSharePage(shareId: string) {
  return render(<SupportPromptSlot slot="share-page" shareId={shareId} {...DATA} />);
}

beforeEach(() => {
  window.localStorage.clear();
  vi.clearAllMocks();
});

afterEach(() => {
  window.localStorage.clear();
});

describe("SupportPromptSlot", () => {
  it("appears on the third share page with the reader's own count, and says so once", async () => {
    openSharePage("one").unmount();
    openSharePage("two").unmount();
    expect(signalMocks.sendMusicSignal).not.toHaveBeenCalled();

    openSharePage("three");

    expect(await screen.findByText("You opened 3 shares.")).toBeTruthy();
    expect(signalMocks.sendMusicSignal).toHaveBeenCalledTimes(1);
    expect(signalMocks.sendMusicSignal).toHaveBeenCalledWith(SupportPromptSignal.Shown, EVENT_DATA);
  });

  it("stays away after a dismissal and reports it with the prompt's id, name and slot only", async () => {
    openSharePage("one").unmount();
    openSharePage("two").unmount();
    openSharePage("three");
    fireEvent.click(await screen.findByRole("button", { name: "Hide" }));

    expect(signalMocks.sendMusicSignal).toHaveBeenLastCalledWith(SupportPromptSignal.Dismissed, EVENT_DATA);
    await waitFor(() => expect(screen.queryByText("You opened 3 shares.")).toBeNull());
    const store = parseStore(window.localStorage.getItem(SUPPORT_PROMPT_STORAGE_KEY), [PROMPT.id]);
    expect(store.prompts[PROMPT.id].dismissed).toBe(1);
    expect(store.snoozedUntil).toBeGreaterThan(Date.now());
  });

  it("marks the prompt done when the invitation is followed, and reports it", async () => {
    openSharePage("one").unmount();
    openSharePage("two").unmount();
    openSharePage("three");
    fireEvent.click(await screen.findByRole("link", { name: /Support musiccloud/ }));

    expect(signalMocks.sendMusicSignal).toHaveBeenLastCalledWith(SupportPromptSignal.Clicked, EVENT_DATA);
    const store = parseStore(window.localStorage.getItem(SUPPORT_PROMPT_STORAGE_KEY), [PROMPT.id]);
    expect(store.prompts[PROMPT.id].resolved).toBe(true);
  });

  it("counts a reload of the same share page once", () => {
    openSharePage("one").unmount();
    openSharePage("one").unmount();

    const store = parseStore(window.localStorage.getItem(SUPPORT_PROMPT_STORAGE_KEY), [PROMPT.id]);
    expect(store.shareViews).toBe(1);
  });

  it("reads the resolved links on the landing page", async () => {
    window.localStorage.setItem(RESOLVED_LINKS_STORAGE_KEY, JSON.stringify({ count: 2, last: "/abc" }));
    const landing = { ...PROMPT, slot: "landing-page" as const, thresholdBasis: "resolved" as const, threshold: 2 };

    render(<SupportPromptSlot slot="landing-page" {...DATA} prompts={[landing]} />);

    expect(await screen.findByText("You opened 0 shares.")).toBeTruthy();
  });

  it("draws only one prompt per page view, even with every limit set aside", async () => {
    // With the limits in force the first showing's quiet period already keeps
    // a second slot quiet, so only the always-show switch isolates the
    // one-per-page rule. The second slot mounts once the first has drawn, as a
    // second island on the page would.
    const atOnce = { ...PROMPT, threshold: 0 };
    const view = render(<SupportPromptSlot slot="landing-page" {...DATA} devAlwaysShow prompts={[atOnce]} />);
    await screen.findByText("You opened 0 shares.");

    view.rerender(
      <>
        <SupportPromptSlot slot="landing-page" {...DATA} devAlwaysShow prompts={[atOnce]} />
        <SupportPromptSlot slot="landing-page" {...DATA} devAlwaysShow prompts={[atOnce]} />
      </>,
    );

    await waitFor(() => expect(signalMocks.sendMusicSignal).toHaveBeenCalled());
    expect(document.querySelectorAll("[data-support-prompt]")).toHaveLength(1);
  });
});
