import { ArrowFatLinesDownIcon, ArrowFatLinesRightIcon } from "@phosphor-icons/react";

import { FlowDirection, type FlowDirectionValue } from "@/components/ui/flowDirection";

interface FlowConnectorProps {
  /** Flow direction the arrow points in; vertical connects stacked sections, horizontal connects pipeline steps. */
  direction?: FlowDirectionValue;
  className?: string;
}

/**
 * Decorative arrow between two stages of a configured flow (ported from
 * lmaa.space), e.g. between submission-pipeline steps (horizontal) or between
 * the pipeline section and the success section (vertical).
 */
export function FlowConnector({ direction = FlowDirection.Vertical, className }: FlowConnectorProps) {
  const isVertical = direction === FlowDirection.Vertical;
  const Icon = isVertical ? ArrowFatLinesDownIcon : ArrowFatLinesRightIcon;

  return (
    <div
      className={`flex items-center justify-center ${
        isVertical ? "h-14 -my-px" : "w-14 -mx-px self-stretch"
      } ${className ?? ""}`}
    >
      <Icon weight="duotone" className="size-5 text-[var(--ds-text)]" aria-hidden="true" />
    </div>
  );
}
