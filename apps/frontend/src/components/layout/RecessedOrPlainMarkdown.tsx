import type { ReactNode } from "react";

import { RecessedCard } from "@/components/cards/RecessedCard";

/**
 * Optional `RecessedCard` shell for the overlay content shape. When present, the
 * recessed arm wraps the (always-present) content box inside a `RecessedCard`
 * carrying these props, and the content box keeps its own scroll padding. When
 * absent, the recessed arm renders the content box AS a `RecessedCard` directly
 * (the fullscreen shape), so the card itself carries `contentClassName`.
 */
interface RecessedShell {
  /** className applied to the wrapping `RecessedCard` (e.g. `"h-full"`). */
  className: string;
  /** padding token forwarded to the wrapping `RecessedCard` (e.g. `"0"`). */
  padding: string;
}

interface RecessedOrPlainMarkdownProps {
  /** When true, the content is rendered inside a `RecessedCard`; otherwise a plain `<div>`. */
  recessed: boolean;
  /**
   * className for the content box that directly wraps `children`. In the
   * overlay shape this is the inner scroll `<div>`; in the fullscreen shape it
   * is the box itself (a `<div>` when not recessed, or the `RecessedCard` when
   * `shell` is omitted).
   */
  contentClassName: string;
  /**
   * Overlay shape only: the outer `RecessedCard` props that wrap the scroll
   * box. Omit for the fullscreen shape, where the recessed arm turns the
   * content box itself into a `RecessedCard`.
   */
  shell?: RecessedShell;
  /** The markdown content (caller keeps the remount `key` on its `MarkdownHtml`). */
  children: ReactNode;
}

/**
 * Renders overlay/fullscreen markdown either inside a `RecessedCard` or a plain
 * box, sharing the recessed-or-plain ternary that the embossed overlay and the
 * fullscreen renderer otherwise duplicate.
 *
 * Two shapes are supported via {@link RecessedOrPlainMarkdownProps.shell}:
 * - overlay (`shell` set): recessed → `RecessedCard(shell) > div(contentClassName) > children`;
 *   plain → `div(contentClassName) > children`.
 * - fullscreen (`shell` omitted): recessed → `RecessedCard(className=contentClassName) > children`;
 *   plain → `div(contentClassName) > children`.
 */
export function RecessedOrPlainMarkdown({ recessed, contentClassName, shell, children }: RecessedOrPlainMarkdownProps) {
  if (recessed) {
    if (shell) {
      return (
        <RecessedCard className={shell.className} padding={shell.padding}>
          <div className={contentClassName}>{children}</div>
        </RecessedCard>
      );
    }
    return <RecessedCard className={contentClassName}>{children}</RecessedCard>;
  }
  return <div className={contentClassName}>{children}</div>;
}
