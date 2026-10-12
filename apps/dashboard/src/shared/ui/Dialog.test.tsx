import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PagesSaveBar } from "@/components/layout/PagesSaveBar";
import { dashboardCopy } from "@/copy/dashboard";
import { UnsavedGuard } from "@/features/content/state/UnsavedGuard";

/** The navigation blocker `UnsavedGuard` reads, switched to blocked by the test. */
const navigation = vi.hoisted(() => ({
  blocker: { state: "unblocked", reset: vi.fn(), proceed: vi.fn() } as {
    state: string;
    reset: () => void;
    proceed: () => void;
  },
}));

vi.mock("react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router")>()),
  useBlocker: () => navigation.blocker,
}));

vi.mock("@/features/content/state/PagesEditorContext", () => ({
  usePagesEditor: () => ({
    dirty: { subscribe: () => () => undefined, groupCount: () => 1, size: () => 1 },
    resetAll: vi.fn(),
  }),
}));

vi.mock("@/features/content/state/useGlobalPagesSave", () => ({
  GlobalPagesSaveStatus: { Idle: "idle", Saving: "saving", Error: "error" },
  useGlobalPagesSave: () => ({
    save: vi.fn(),
    discard: vi.fn(),
    status: "idle",
    errorDetails: null,
    errorMessage: null,
    errorId: null,
  }),
}));

/** Whether a dialog is playing its closing animation. */
function isClosing(dialog: HTMLElement): boolean {
  return dialog.style.animation.startsWith("mc-card-out");
}

describe("stacked dialogs", () => {
  it("close one at a time from the top and stack their z-index", () => {
    // The layout mounts both. The discard confirmation opens first, and the
    // unsaved-changes guard opens above it when the browser navigates back.
    const tree = () => (
      <>
        <PagesSaveBar />
        <UnsavedGuard />
      </>
    );
    const view = render(tree());
    fireEvent.click(screen.getByRole("button", { name: dashboardCopy.layout.pagesSaveBar.discard }));
    navigation.blocker = { ...navigation.blocker, state: "blocked" };
    view.rerender(tree());

    const discard = screen.getByRole("dialog", { name: dashboardCopy.layout.pagesSaveBar.discardTitle });
    const guard = screen.getByRole("dialog", { name: dashboardCopy.unsavedGuard.title });
    expect(discard.parentElement?.style.zIndex).toBe("2000");
    expect(guard.parentElement?.style.zIndex).toBe("2100");

    fireEvent.keyDown(window, { key: "Escape" });

    expect(isClosing(guard)).toBe(true);
    expect(isClosing(discard)).toBe(false);
  });
});
