/**
 * @file Draws at most one support prompt in one place on the page.
 *
 * Ported from lmaa.space (`apps/frontend/src/components/islands/SupportPromptSlot.tsx`).
 * Everything about whether to draw it lives in the reader's own browser, which
 * is why this decides on the client rather than on the server: how many share
 * pages they have opened, how many links they have resolved, how often they
 * have been asked, and when they last said not now.
 *
 * The prompt sits in the flow of the page. Nothing is dimmed, nothing is
 * covered, and the page stays usable whether or not the reader answers.
 */

import type { PublicSupportPrompt, SupportPromptSlot as SlotName } from "@musiccloud/shared";
import { HeartIcon, XCircleIcon } from "@phosphor-icons/react";
import { type CSSProperties, useCallback, useState, useSyncExternalStore } from "react";

import {
  embossedCardContentInset,
  embossedCardOuterRadius,
  recessedSurfaceRadius,
} from "@/components/cards/cardGeometry";
import { EmbossedCard } from "@/components/cards/EmbossedCard";
import { MarkdownHtml } from "@/components/markdown/MarkdownHtml";
import { EmbossedButton } from "@/components/ui/EmbossedButton";
import { commonCopy } from "@/copy/common";
import { SupportPromptSignal, sendMusicSignal } from "@/lib/analytics/umami";
import { buildExpandTimeline } from "@/lib/motion/collapse";
import { MotionDuration } from "@/lib/motion/constants";
import { fillPromptNumbers } from "@/lib/support/prompt-numbers";
import { readResolvedLinkCount } from "@/lib/support/resolved-links";
import {
  choosePrompt,
  countShareView,
  parseStore,
  recordDismissed,
  recordResolved,
  recordShown,
  SUPPORT_PROMPT_STORAGE_KEY,
  type SupportPromptStore,
} from "@/lib/support/support-prompt-store";
import type { SupportPromptSlotData } from "@/lib/support/support-prompts";
import { cn } from "@/lib/utils";

/** Props of {@link SupportPromptSlot}. */
export interface SupportPromptSlotProps extends SupportPromptSlotData {
  /** Which place is asking, which decides what counts as progress. */
  slot: SlotName;
  /** The short id of the share page being looked at, on a share page. */
  shareId?: string;
  /** Where the prompt sits, given by whatever holds it. */
  className?: string;
}

/** The attribute every drawn prompt carries, so a second slot on the same page can find it. */
const PROMPT_ATTRIBUTE = "data-support-prompt";

/**
 * Writes the store back, ignoring a browser that refuses to store anything.
 *
 * @param store - The store to keep.
 */
function persist(store: SupportPromptStore): void {
  try {
    window.localStorage.setItem(SUPPORT_PROMPT_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // A reader who blocks storage sees the prompt again next time, which is a
    // better outcome than a page that fails.
  }
}

/**
 * Reads the store, treating a browser that refuses storage as one that holds nothing.
 *
 * @param liveIds - The prompts that still exist, whose records are kept.
 * @returns The store.
 */
function readStore(liveIds: readonly string[]): SupportPromptStore {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(SUPPORT_PROMPT_STORAGE_KEY);
  } catch {
    raw = null;
  }
  return parseStore(raw, liveIds);
}

/** Where the invitation stands, named as the stacks name it. */
const BUTTON_ROW_CLASSES: Record<PublicSupportPrompt["buttonAlignment"], string> = {
  leading: "justify-start",
  center: "justify-center",
  trailing: "justify-end",
};

/**
 * The close control's place and corner.
 *
 * Half the card's content inset out, so it sits in the corner rather than in
 * the text's own column. A nested corner is the card's radius less the
 * distance to it, and this control sits at half the inset rather than at all
 * of it.
 */
const CLOSE_STYLE: CSSProperties = {
  top: `calc(${embossedCardContentInset} / 2)`,
  right: `calc(${embossedCardContentInset} / 2)`,
  borderRadius: `max(calc(${embossedCardOuterRadius} - ${embossedCardContentInset} / 2), 0px)`,
};

/**
 * The invitation's corner.
 *
 * It occupies the corner of the content area, so it takes the card's radius
 * less the content inset rather than a control's own. That is what keeps the
 * gap between the two curves even.
 */
const INVITE_STYLE = {
  "--neu-radius-base": recessedSurfaceRadius,
  "--neu-radius-sm": recessedSurfaceRadius,
} as CSSProperties;

/**
 * The prompt the reader's browser chose, with its text already filled in.
 *
 * One piece of state, because the prompt and the text filled in for it are
 * decided together and shown together. Two would allow a render between the
 * two writes, showing one prompt's text under another's buttons.
 */
interface ShownPrompt {
  prompt: PublicSupportPrompt;
  html: string;
}

/** What {@link takePageView} needs to know about the slot. */
type PageViewInput = Omit<SupportPromptSlotProps, "className">;

/**
 * Takes one page view in the reader's browser: counts it, and picks the prompt
 * to show for it, if any.
 *
 * On a share page the visit is counted before anything can return, because it
 * happened whether or not this page has a prompt to show for it, and the
 * counter is not this slot's own: the prompt on the landing page measures its
 * threshold against the same number. `countShareView` refuses the same share
 * page twice, so standing ahead of the guards cannot count a page twice either.
 *
 * A prompt that is chosen is recorded as shown and reported, so the call is
 * made once per page view.
 *
 * @param input - The slot and its data.
 * @returns The prompt to draw with its text filled in, or `null` for none.
 */
function takePageView({ slot, prompts, limits, liveIds, devAlwaysShow, shareId }: PageViewInput): ShownPrompt | null {
  let store = readStore(liveIds);
  if (slot === "share-page" && shareId) {
    store = countShareView(store, shareId);
    persist(store);
  }

  // One prompt per page view. A second slot on the same page stays quiet.
  if (prompts.length === 0 || document.querySelector(`[${PROMPT_ATTRIBUTE}]`)) return null;

  // Which counter a threshold reads is the prompt's own answer, because the
  // same place can carry a prompt about what somebody has resolved and one
  // about what they have been opening.
  const linksResolved = readResolvedLinkCount();
  const counters = { opened: store.shareViews, resolved: linksResolved };
  const chosen = choosePrompt(prompts, store, limits, counters, Date.now(), devAlwaysShow);
  const prompt = chosen ? prompts.find((entry) => entry.id === chosen.id) : undefined;
  if (!prompt) return null;

  persist(recordShown(store, prompt.id, limits, Date.now()));
  sendMusicSignal(SupportPromptSignal.Shown, { prompt: prompt.name, id: prompt.id, slot });
  return {
    prompt,
    html: fillPromptNumbers(prompt.html, { linksResolved, sharePagesOpened: store.shareViews }),
  };
}

/**
 * Grows the card into place as it is attached.
 *
 * A prompt cannot be decided on the server, because what decides it lives in
 * the reader's browser. It therefore arrives after the page has been laid out,
 * and whatever stands below it has to move. The card grows into place with the
 * site's curtain reveal, which moves nothing but transforms.
 *
 * Written as a callback ref rather than an effect, as lmaa.space writes it,
 * because the element being attached is exactly the moment to do this, and an
 * effect watching the state that produced it would be a second render for
 * nothing.
 *
 * @param shell - The slot's outer element, whose child is the curtain and
 *   whose grandchild is the card; `null` when it is detached.
 */
function revealCard(shell: HTMLElement | null): void {
  const curtain = shell?.firstElementChild;
  const content = curtain?.firstElementChild;
  if (!shell || !(curtain instanceof HTMLElement) || !(content instanceof HTMLElement)) return;
  buildExpandTimeline({ shell, curtain, content, fromCollapsed: true, duration: MotionDuration.PromptReveal });
}

/**
 * One slot's page view, held as an external store the way the site holds its
 * other browser stores, because what it holds comes from the reader's storage,
 * which the server cannot read.
 *
 * The page view is taken once, when the slot first subscribes after mounting,
 * so a subscription made again for the same slot counts nothing twice.
 */
interface PageViewStore {
  /** The prompt drawn, or `null` for none. Stable between changes, as `useSyncExternalStore` needs. */
  read: () => ShownPrompt | null;
  /** Replaces what is drawn and tells every subscriber. */
  write: (next: ShownPrompt | null) => void;
  /** Subscribes, taking the page view with `take` on the first subscription. */
  subscribe: (onChange: () => void, take: () => ShownPrompt | null) => () => void;
}

/**
 * Creates the store of one slot's page view.
 *
 * @returns An empty store whose page view has not been taken.
 */
function createPageViewStore(): PageViewStore {
  let snapshot: ShownPrompt | null = null;
  let taken = false;
  const listeners = new Set<() => void>();

  const write = (next: ShownPrompt | null) => {
    snapshot = next;
    for (const listener of listeners) listener();
  };

  return {
    read: () => snapshot,
    write,
    subscribe(onChange, take) {
      listeners.add(onChange);
      if (!taken) {
        taken = true;
        write(take());
      }
      return () => listeners.delete(onChange);
    },
  };
}

/**
 * What a slot draws on the server, which is nothing, because whether to draw
 * anything is decided in the reader's browser.
 *
 * @returns Always `null`.
 */
function serverPageView(): null {
  return null;
}

/**
 * Draws at most one prompt in one place on the page.
 *
 * Once mounted it takes the page view (see {@link takePageView}) and grows the
 * chosen card into place. Closing it records a dismissal; following the
 * invitation records the prompt as done. Each of the three sends an analytics
 * event carrying only the prompt's id, name and slot.
 *
 * @param props - See {@link SupportPromptSlotProps}.
 * @returns The prompt, or nothing.
 */
export function SupportPromptSlot({
  slot,
  prompts,
  limits,
  liveIds,
  devAlwaysShow,
  shareId,
  className,
}: SupportPromptSlotProps) {
  const [pageView] = useState(createPageViewStore);
  const subscribe = useCallback(
    (onChange: () => void) =>
      pageView.subscribe(onChange, () => takePageView({ slot, prompts, limits, liveIds, devAlwaysShow, shareId })),
    [pageView, slot, prompts, limits, liveIds, devAlwaysShow, shareId],
  );
  const shown = useSyncExternalStore(subscribe, pageView.read, serverPageView);

  if (!shown) return null;
  const visible = shown.prompt;

  function close() {
    persist(recordDismissed(readStore(liveIds), visible.id, limits, Date.now()));
    sendMusicSignal(SupportPromptSignal.Dismissed, { prompt: visible.name, id: visible.id, slot });
    pageView.write(null);
  }

  function follow() {
    persist(recordResolved(readStore(liveIds), visible.id));
    sendMusicSignal(SupportPromptSignal.Clicked, { prompt: visible.name, id: visible.id, slot });
  }

  return (
    <aside ref={revealCard} {...{ [PROMPT_ATTRIBUTE]: visible.id }} className={cn("overflow-hidden", className)}>
      <div className="overflow-hidden">
        <div>
          <EmbossedCard className="w-full">
            <div className="relative flex flex-col gap-3">
              <button
                type="button"
                onClick={close}
                aria-label={commonCopy.supportPrompt.dismiss}
                // Dimmed, because it is a way out rather than something to do.
                className="absolute inline-flex size-7 items-center justify-center text-text-secondary opacity-50 transition-opacity hover:opacity-100"
                style={CLOSE_STYLE}
              >
                <XCircleIcon weight="duotone" className="size-5" />
              </button>

              <MarkdownHtml
                html={shown.html}
                className="mc-prompt-copy prose prose-invert max-w-none pr-8 text-sm text-text-secondary"
              />

              {/* The same invitation the sponsor wall carries, so the ask looks
                  like one thing across the site rather than like two. Saying no
                  is the cross in the corner, which every prompt carries whether
                  or not it invites. Where it stands is the prompt's own choice,
                  because a prompt is a short piece of copy whose author decides
                  how it sits. */}
              {visible.buttonLabel && (
                <div className={cn("flex flex-wrap items-center gap-3", BUTTON_ROW_CLASSES[visible.buttonAlignment])}>
                  <EmbossedButton
                    href={visible.buttonHref}
                    onClick={follow}
                    className="inline-flex items-center gap-2 text-sm font-semibold text-text-primary"
                    style={INVITE_STYLE}
                  >
                    <HeartIcon weight="fill" className="size-4" aria-hidden="true" />
                    {visible.buttonLabel}
                  </EmbossedButton>
                </div>
              )}
            </div>
          </EmbossedCard>
        </div>
      </div>
    </aside>
  );
}
