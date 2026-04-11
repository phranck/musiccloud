import { LanguageSwitcher } from "@/components/navigation/LanguageSwitcher";
import { InfoButton } from "@/components/ui/InfoButton";

interface PageHeaderProps {
  /** Show the circular info button (landing page and result pages only) */
  showInfoButton?: boolean;
  onInfoClick?: () => void;
}

/**
 * Fixed top-right header bar: Language Switcher + optional Info Button.
 * Must be rendered inside a LocaleProvider (provides context for LanguageSwitcher and InfoButton).
 */
export function PageHeader({ showInfoButton = false, onInfoClick }: PageHeaderProps) {
  return (
    <div className="fixed top-4 right-4 z-40 hidden sm:flex items-center gap-1">
      <LanguageSwitcher />
      {showInfoButton && onInfoClick && <InfoButton onClick={onInfoClick} />}
    </div>
  );
}
