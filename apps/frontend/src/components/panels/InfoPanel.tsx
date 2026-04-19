import { XIcon } from "@phosphor-icons/react";

import { TranslucentCard } from "@/components/cards/TranslucentCard";
import { type InfoPanelTab, useInfoPanel } from "@/hooks/useInfoPanel";
import { useLocale, useT } from "@/i18n/context";

interface InfoPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function InfoPanel({ isOpen, onClose }: InfoPanelProps) {
  const { locale } = useLocale();
  const t = useT();

  const { isVisible, activeTab, setActiveTab, content, isLoading, contentHeight, tabRefs, handleClose } = useInfoPanel(
    isOpen,
    onClose,
    locale,
    t,
  );

  if (!isOpen) return null;

  const tabs: { id: InfoPanelTab; label: string }[] = [
    { id: "about", label: t("tab.about") },
    { id: "services", label: t("tab.services") },
    { id: "imprint", label: t("tab.imprint") },
    { id: "dsgvo", label: t("tab.privacy") },
  ];

  const mdClasses = [
    "[&_h1]:text-white [&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:mb-3 [&_h1]:mt-0",
    "[&_h2]:text-white/90 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mb-2 [&_h2]:mt-6 [&_h2:first-child]:mt-0",
    "[&_h3]:text-white/80 [&_h3]:text-base [&_h3]:font-medium [&_h3]:mb-1 [&_h3]:mt-4",
    "[&_p]:text-white/60 [&_p]:text-lg [&_p]:leading-relaxed [&_p]:mb-3",
    "[&_ul]:text-white/60 [&_ul]:text-lg [&_ul]:pl-5 [&_ul]:mb-3 [&_ul]:space-y-1 [&_ul]:list-disc",
    "[&_ol]:text-white/60 [&_ol]:text-lg [&_ol]:pl-5 [&_ol]:mb-3 [&_ol]:space-y-1 [&_ol]:list-decimal",
    "[&_li]:leading-relaxed",
    "[&_strong]:text-white/80 [&_strong]:font-medium",
    "[&_a]:text-[var(--color-accent,#a78bfa)] [&_a]:underline",
    "[&_hr]:border-white/10 [&_hr]:my-4",
    "[&_small]:block [&_small]:text-white/60 [&_small]:text-base [&_small]:leading-tight",
    "[&_sup]:text-[0.75em] [&_sup]:font-bold [&_sup]:align-super",
    "[&>*:last-child]:mb-0",
  ].join(" ");

  const transitionClasses = "transition-[opacity,transform] duration-[380ms] ease-out";
  const visibilityClasses = isVisible ? "opacity-100 scale-100" : "opacity-0 scale-[0.96]";

  return (
    <>
      <div
        className={`fixed inset-0 backdrop-blur-sm z-50 transition-opacity duration-[380ms] ${isVisible ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        onClick={handleClose}
        aria-hidden="true"
      />

      <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
        <TranslucentCard
          className={`pointer-events-auto w-[560px] max-w-[calc(100vw-2rem)] max-h-[60vh] ${transitionClasses} ${visibilityClasses}`}
        >
          <TranslucentCard.Header className="flex items-end justify-between pb-0">
            <div id="info-panel-title" className="flex-1">
              <TranslucentCard.SegmentedControl
                className="px-0 border-b-0"
                segments={tabs.map((tab) => ({ key: tab.id, label: tab.label }))}
                value={activeTab}
                onChange={(next) => setActiveTab(next as InfoPanelTab)}
              />
            </div>
            <button
              type="button"
              onClick={handleClose}
              aria-label={t("infopanel.close")}
              className="mb-2 p-1.5 text-white/30 hover:text-white/70 transition-colors duration-150 rounded-lg focus:outline-none"
            >
              <XIcon size={16} weight="duotone" />
            </button>
          </TranslucentCard.Header>

          <div
            className={`overflow-hidden relative flex-shrink-0 ${contentHeight !== null ? "transition-[height] duration-300 ease-in-out" : ""}`}
            style={{ height: contentHeight !== null ? contentHeight : "auto" }}
          >
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center py-10">
                <div className="w-5 h-5 rounded-full border-2 border-white/20 border-t-white/60 animate-spin" />
              </div>
            )}

            {tabs.map(({ id }) => (
              <div
                key={id}
                ref={(el) => {
                  tabRefs.current[id] = el;
                }}
                id={`panel-${id}`}
                role="tabpanel"
                aria-labelledby={`tab-${id}`}
                className={`overflow-y-auto px-6 py-5 max-h-[calc(60vh-72px)]
                  ${activeTab === id ? "" : "absolute inset-0 opacity-0 pointer-events-none"}`}
              >
                {content && <div className={mdClasses} dangerouslySetInnerHTML={{ __html: content[id] }} />}
              </div>
            ))}
          </div>
        </TranslucentCard>
      </div>
    </>
  );
}
