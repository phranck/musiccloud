import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/analytics/umami", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/analytics/umami")>()),
  sendMusicSignal: vi.fn(),
}));

import { SUPPORT_PAGE_PATH, SupportHeaderLink } from "@/components/navigation/SupportHeaderLink";
import { commonCopy } from "@/copy/common";
import { SupportSignal, sendMusicSignal } from "@/lib/analytics/umami";

afterEach(() => {
  vi.clearAllMocks();
});

describe("SupportHeaderLink", () => {
  it("links to the support page with the long label for wide screens and the short one for narrow ones", () => {
    render(<SupportHeaderLink />);

    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe(SUPPORT_PAGE_PATH);
    expect(SUPPORT_PAGE_PATH).toBe("/support-me");
    expect(screen.getByText(commonCopy.support.headerLabel).className).toContain("hidden sm:inline");
    expect(screen.getByText(commonCopy.support.headerShortLabel).className).toContain("sm:hidden");
  });

  it("sends the header button event when it is clicked, and still navigates", () => {
    render(<SupportHeaderLink />);

    const link = screen.getByRole("link");
    const allowed = fireEvent.click(link);

    expect(sendMusicSignal).toHaveBeenCalledWith(SupportSignal.HeaderButton);
    expect(allowed).toBe(true);
  });
});
