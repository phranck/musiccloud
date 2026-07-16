// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { activateSdkSegmentedPanel, bindSdkSegmentedCards } from "./sdk-segmented-card";

function renderSdkCard() {
  document.body.innerHTML = `
    <article
      data-sdk-segmented-card
      style="--segmented-card-transition-duration: 160ms; --segmented-card-transition-easing: ease-in-out"
    >
      <div role="tablist">
        <button data-sdk-tab="typescript" role="tab" aria-controls="sdk-typescript" aria-selected="true" tabindex="0">TypeScript</button>
        <button data-sdk-tab="python" role="tab" aria-controls="sdk-python" aria-selected="false" tabindex="-1">Python</button>
        <button data-sdk-tab="swift" role="tab" aria-controls="sdk-swift" aria-selected="false" tabindex="-1">Swift</button>
      </div>
      <div data-segmented-card-body>
        <section id="sdk-typescript" data-sdk-panel="typescript" role="tabpanel" data-sdk-download-url="/typescript.zip" data-sdk-download-label="Download TypeScript SDK"></section>
        <section id="sdk-python" data-sdk-panel="python" role="tabpanel" hidden data-sdk-download-url="/python.zip" data-sdk-download-label="Download Python SDK"></section>
        <section id="sdk-swift" data-sdk-panel="swift" role="tabpanel" hidden data-sdk-download-url="/swift.zip" data-sdk-download-label="Download Swift SDK"></section>
      </div>
      <a data-sdk-download href="/typescript.zip" aria-label="Download TypeScript SDK">Download</a>
    </article>
  `;
}

describe("SDK segmented card", () => {
  afterEach(() => {
    document.body.replaceChildren();
    window.history.replaceState(null, "", "/");
  });

  it("switches all tab, panel, and download states when a language tab is selected", () => {
    renderSdkCard();
    const cleanup = bindSdkSegmentedCards(document);
    const swiftTab = document.querySelector<HTMLButtonElement>('[data-sdk-tab="swift"]')!;
    const swiftPanel = document.getElementById("sdk-swift")!;
    const typescriptPanel = document.getElementById("sdk-typescript")!;
    const download = document.querySelector<HTMLAnchorElement>("[data-sdk-download]")!;

    swiftTab.click();

    expect(swiftTab.getAttribute("aria-selected")).toBe("true");
    expect(swiftTab.tabIndex).toBe(0);
    expect(swiftPanel.hidden).toBe(false);
    expect(typescriptPanel.hidden).toBe(true);
    expect(download.getAttribute("href")).toBe("/swift.zip");
    expect(download.getAttribute("aria-label")).toBe("Download Swift SDK");
    cleanup();
  });

  it("uses roving focus for arrow keys and activates deep-linked language panels", () => {
    renderSdkCard();
    const cleanup = bindSdkSegmentedCards(document);
    const typescriptTab = document.querySelector<HTMLButtonElement>('[data-sdk-tab="typescript"]')!;
    const pythonTab = document.querySelector<HTMLButtonElement>('[data-sdk-tab="python"]')!;

    typescriptTab.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    expect(document.activeElement).toBe(document.querySelector('[data-sdk-tab="swift"]'));
    expect(document.getElementById("sdk-swift")?.hidden).toBe(false);

    expect(activateSdkSegmentedPanel(document, "sdk-python")).toBe(true);
    expect(pythonTab.getAttribute("aria-selected")).toBe("true");
    expect(document.getElementById("sdk-python")?.hidden).toBe(false);
    cleanup();
  });

  it("animates the segmented-card body between measured panel heights", () => {
    renderSdkCard();
    const body = document.querySelector<HTMLElement>("[data-segmented-card-body]")!;
    const animate = vi.fn(() => ({
      cancel: vi.fn(),
      commitStyles: vi.fn(),
      finished: new Promise<Animation>(() => undefined),
    }));
    Object.defineProperty(body, "animate", { configurable: true, value: animate });
    Object.defineProperty(body, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        height: document.getElementById("sdk-typescript")?.hidden ? 320 : 480,
      }),
    });

    const cleanup = bindSdkSegmentedCards(document);
    document.querySelector<HTMLButtonElement>('[data-sdk-tab="python"]')!.click();

    expect(animate).toHaveBeenCalledWith([{ height: "480px" }, { height: "320px" }], {
      duration: 160,
      easing: "ease-in-out",
    });
    cleanup();
  });
});
