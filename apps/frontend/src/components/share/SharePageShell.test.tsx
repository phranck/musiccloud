import { type PublicSupportPrompt, SUPPORT_PROMPT_LIMIT_DEFAULTS } from "@musiccloud/shared";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The result itself is not under test, only where the prompt stands beside it.
vi.mock("@/components/share/ShareLayout", () => ({
  ShareLayout: () => <div data-testid="share-result" />,
}));

import type { ShareContentConfiguration } from "@/lib/types/media-card";
import { CcSharePageShell } from "./CcSharePageShell";
import { SharePageShell } from "./SharePageShell";

/** A share page prompt that qualifies on the first share page. */
const SHARE_PROMPT: PublicSupportPrompt = {
  id: "share-ask",
  name: "Share ask",
  slot: "share-page",
  html: "<p>Keep musiccloud running.</p>",
  buttonLabel: "",
  buttonHref: "/support-me",
  buttonAlignment: "trailing",
  threshold: 0,
  thresholdBasis: "opened",
  priority: 0,
};

/** The share page's prompt data as the server hands it over. */
const SHARE_PROMPTS = {
  prompts: [SHARE_PROMPT],
  limits: SUPPORT_PROMPT_LIMIT_DEFAULTS,
  devAlwaysShow: false,
};

/** The result's configuration, which the stubbed layout ignores. */
const CONFIG = {} as ShareContentConfiguration;

/**
 * Waits for the prompt to be drawn and checks that it stands between the logo
 * and the result.
 */
async function expectPromptAboveResult() {
  const prompt = await waitFor(() => {
    const found = document.querySelector("[data-support-prompt]");
    if (!found) throw new Error("the support prompt is not drawn yet");
    return found;
  });
  const logo = screen.getByLabelText("Go to musiccloud home");
  const result = screen.getByTestId("share-result");

  expect(logo.compareDocumentPosition(prompt) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(prompt.compareDocumentPosition(result) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
});

describe("share page support prompt placement", () => {
  it("stands above the result on a share page", async () => {
    render(<SharePageShell config={CONFIG} artistName="Artist" shareId="abc12" supportPrompts={SHARE_PROMPTS} />);
    await expectPromptAboveResult();
  });

  it("stands above the result on a CC share page", async () => {
    render(
      <CcSharePageShell
        config={CONFIG}
        artistName="Artist"
        labels={{ similar: "Similar", profileProvidedBy: "Profile" }}
        shareId="abc12"
        supportPrompts={SHARE_PROMPTS}
      />,
    );
    await expectPromptAboveResult();
  });
});
