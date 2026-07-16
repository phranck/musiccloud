// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { bindSegmentedControlIndicators } from "./segmented-control";

function defineBox(element: HTMLElement, left: number, width: number) {
  Object.defineProperties(element, {
    offsetHeight: { configurable: true, value: 32 },
    offsetLeft: { configurable: true, value: left },
    offsetTop: { configurable: true, value: 3 },
    offsetWidth: { configurable: true, value: width },
  });
}

describe("segmented-control selection indicator", () => {
  afterEach(() => document.body.replaceChildren());

  it("slides and resizes the shared selection surface when aria-selected changes", async () => {
    document.body.innerHTML = `
      <div class="segmented-control">
        <button class="segmented-control__item" aria-selected="true">Key documentation</button>
        <button class="segmented-control__item" aria-selected="false">JSON schema</button>
      </div>
    `;
    const control = document.querySelector<HTMLElement>(".segmented-control")!;
    const [documentation, json] = Array.from(control.querySelectorAll<HTMLButtonElement>(".segmented-control__item"));
    defineBox(documentation!, 3, 132);
    defineBox(json!, 135, 84);

    const cleanup = bindSegmentedControlIndicators(document);

    expect(control.dataset.segmentedControlIndicatorReady).toBe("true");
    expect(control.style.getPropertyValue("--segmented-control-indicator-x")).toBe("3px");
    expect(control.style.getPropertyValue("--segmented-control-indicator-width")).toBe("132px");

    documentation!.setAttribute("aria-selected", "false");
    json!.setAttribute("aria-selected", "true");

    await vi.waitFor(() => {
      expect(control.style.getPropertyValue("--segmented-control-indicator-x")).toBe("135px");
      expect(control.style.getPropertyValue("--segmented-control-indicator-width")).toBe("84px");
    });
    cleanup();
  });
});
