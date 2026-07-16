/** Browser controller for the static SDK segmented-card markup. */

import { animateSegmentedCardBody } from "./segmented-card";

type SdkCardRoot = HTMLElement;

function getTabs(card: SdkCardRoot): HTMLButtonElement[] {
  return Array.from(card.querySelectorAll<HTMLButtonElement>("[data-sdk-tab]"));
}

function getPanels(card: SdkCardRoot): HTMLElement[] {
  return Array.from(card.querySelectorAll<HTMLElement>("[data-sdk-panel]"));
}

function selectSdkPanel(card: SdkCardRoot, language: string, focus = false): boolean {
  const tabs = getTabs(card);
  const panels = getPanels(card);
  const panel = panels.find((candidate) => candidate.dataset.sdkPanel === language);
  if (!panel) return false;

  card.dataset.sdkLanguage = language;
  for (const tab of tabs) {
    const selected = tab.dataset.sdkTab === language;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
    if (selected && focus) tab.focus();
  }
  animateSegmentedCardBody(card, () => {
    for (const candidate of panels) {
      const selected = candidate === panel;
      candidate.hidden = !selected;
      candidate.setAttribute("aria-hidden", String(!selected));
      candidate.inert = !selected;
    }
  });

  const download = card.querySelector<HTMLAnchorElement>("[data-sdk-download]");
  const url = panel.dataset.sdkDownloadUrl;
  const label = panel.dataset.sdkDownloadLabel;
  if (download && url && label) {
    download.href = url;
    download.setAttribute("aria-label", label);
  }
  return true;
}

/** Activates the SDK panel that owns a stable SDK anchor, if present. */
export function activateSdkSegmentedPanel(root: ParentNode, targetId: string): boolean {
  const target = Array.from(root.querySelectorAll<HTMLElement>("[data-sdk-panel]")).find(
    (candidate) => candidate.id === targetId,
  );
  const card = target?.closest<SdkCardRoot>("[data-sdk-segmented-card]");
  const language = target?.dataset.sdkPanel;
  return Boolean(card && language && selectSdkPanel(card, language));
}

/**
 * Binds roving tab focus and hash activation to all SDK cards in a rendered
 * documentation root. The returned cleanup is safe for tests and future
 * client-side transitions.
 */
export function bindSdkSegmentedCards(root: ParentNode = document): () => void {
  const cleanups: Array<() => void> = [];
  const cards = Array.from(root.querySelectorAll<SdkCardRoot>("[data-sdk-segmented-card]"));

  for (const card of cards) {
    if (card.dataset.sdkSegmentedCardBound === "true") continue;
    card.dataset.sdkSegmentedCardBound = "true";
    const tabs = getTabs(card);

    for (const tab of tabs) {
      const onClick = () => selectSdkPanel(card, tab.dataset.sdkTab ?? "");
      const onKeyDown = (event: KeyboardEvent) => {
        if (!tabs.length || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const currentIndex = tabs.indexOf(tab);
        const nextIndex =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? tabs.length - 1
              : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
        const nextTab = tabs[nextIndex];
        if (nextTab) selectSdkPanel(card, nextTab.dataset.sdkTab ?? "", true);
      };
      tab.addEventListener("click", onClick);
      tab.addEventListener("keydown", onKeyDown);
      cleanups.push(() => {
        tab.removeEventListener("click", onClick);
        tab.removeEventListener("keydown", onKeyDown);
      });
    }
  }

  const activateHash = () => activateSdkSegmentedPanel(root, window.location.hash.slice(1));
  activateHash();
  window.addEventListener("hashchange", activateHash);
  cleanups.push(() => window.removeEventListener("hashchange", activateHash));

  return () => {
    for (const cleanup of cleanups) cleanup();
    for (const card of cards) delete card.dataset.sdkSegmentedCardBound;
  };
}
