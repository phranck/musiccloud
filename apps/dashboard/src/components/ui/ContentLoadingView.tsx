import { SpinnerGap as SpinnerGapIcon } from "@phosphor-icons/react";
import { useI18n } from "@/context/I18nContext";

interface ContentLoadingViewProps {
  /**
   * Overrides the loading label. Defaults to the shared `common.loading`
   * message ("Wird geladen…" / "Loading…") when omitted.
   */
  title?: string;
  /** Optional secondary line shown beneath the label. */
  subtitle?: string;
  /** Extra classes merged onto the outer container (e.g. flex sizing). */
  className?: string;
}

/**
 * Full-area loading placeholder for list/section content, visually conformant
 * with {@link ContentUnavailableView}: same centered container and typography,
 * so a page can swap between the loading, empty and populated states without
 * the layout shifting.
 *
 * Renders a spinning `SpinnerGap` icon in the same slot the empty state uses
 * for its icon, with an accessible loading label below it. Because it is a
 * neutral loader rather than a table skeleton, transitioning from loading to
 * the empty state reads calmly instead of a fake table collapsing to nothing.
 *
 * Exposes `role="status"` so assistive tech announces the loading label.
 *
 * @param title - Optional label override; defaults to `common.loading`.
 * @param subtitle - Optional secondary line beneath the label.
 * @param className - Optional extra classes for the outer container.
 * @returns A centered loading view filling the available area.
 */
export function ContentLoadingView({ title, subtitle, className }: ContentLoadingViewProps) {
  const { messages } = useI18n();
  const label = title ?? messages.common.loading;

  return (
    <output
      className={["grid w-full h-full min-h-80 place-items-center self-stretch p-6 text-center", className]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="flex flex-col items-center justify-center gap-3">
        <span className="text-[var(--ds-text-muted)] [&_svg]:w-12 [&_svg]:h-12">
          <SpinnerGapIcon className="animate-spin" aria-hidden />
        </span>
        <div className="space-y-1">
          <p className="text-lg font-bold font-heading text-[var(--ds-text)]">{label}</p>
          {subtitle && (
            <p className="text-xs text-[var(--ds-text-muted)] max-w-[240px] mx-auto leading-relaxed">{subtitle}</p>
          )}
        </div>
      </div>
    </output>
  );
}
