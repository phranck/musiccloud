import { EmbossedButton } from "@/components/ui/EmbossedButton";
import { useT } from "@/i18n/localeContext";

interface PagedListFooterProps {
  /** Total page count; the footer renders nothing when this is `<= 1`. */
  pageCount: number;
  /** Whether a previous page exists (the Previous button is disabled when false). */
  canGoPrevious: boolean;
  /** Whether a next page exists (the Next button is disabled when false). */
  canGoNext: boolean;
  /** Step to the previous page. */
  onPrevious: () => void;
  /** Step to the next page. */
  onNext: () => void;
}

/** Shared layout/typography for both pager buttons. */
const PAGER_BUTTON_CLASS = "flex min-h-10 items-center justify-center px-3 py-0 text-sm font-medium text-text-primary";

/**
 * Previous/Next pager footer for a paged list (driven by {@link usePagedList}).
 * Renders nothing when there is only a single page. Two equal-width embossed
 * buttons, each disabled at its respective end of the range.
 */
export function PagedListFooter({ pageCount, canGoPrevious, canGoNext, onPrevious, onNext }: PagedListFooterProps) {
  const t = useT();
  if (pageCount <= 1) return null;

  return (
    <div className="grid grid-cols-2 gap-2">
      <EmbossedButton
        as="button"
        type="button"
        onClick={onPrevious}
        disabled={!canGoPrevious}
        className={PAGER_BUTTON_CLASS}
      >
        {t("pager.previous")}
      </EmbossedButton>
      <EmbossedButton as="button" type="button" onClick={onNext} disabled={!canGoNext} className={PAGER_BUTTON_CLASS}>
        {t("pager.next")}
      </EmbossedButton>
    </div>
  );
}
