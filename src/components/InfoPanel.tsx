import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { FaXmark } from "react-icons/fa6";

interface InfoPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

type Tab = "about" | "services" | "imprint" | "dsgvo";

interface PanelContent {
  about: string;
  services: string;
  imprint: string;
  dsgvo: string;
}

const TABS: { id: Tab; label: string }[] = [
  { id: "about", label: "About" },
  { id: "services", label: "Services" },
  { id: "imprint", label: "Imprint" },
  { id: "dsgvo", label: "DSGVO" },
];

export function InfoPanel({ isOpen, onClose }: InfoPanelProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("about");
  const [content, setContent] = useState<PanelContent | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [contentHeight, setContentHeight] = useState(0);

  const tabRefs = useRef<Record<Tab, HTMLDivElement | null>>({
    about: null,
    services: null,
    imprint: null,
    dsgvo: null,
  });

  // Trigger enter animation one frame after mount
  useLayoutEffect(() => {
    if (!isOpen) return;
    const frame = requestAnimationFrame(() => setIsVisible(true));
    return () => cancelAnimationFrame(frame);
  }, [isOpen]);

  // Animated close: fade+scale out, then unmount
  const handleClose = useCallback(() => {
    setIsVisible(false);
    setTimeout(onClose, 380);
  }, [onClose]);

  // Load markdown content on first open
  useEffect(() => {
    if (!isOpen || content) return;
    setIsLoading(true);
    Promise.all([
      fetch("/content/about.md").then((r) => r.text()),
      fetch("/content/services.md").then((r) => r.text()),
      fetch("/content/imprint.md").then((r) => r.text()),
      fetch("/content/dsgvo.md").then((r) => r.text()),
    ])
      .then(async ([aboutMd, servicesMd, imprintMd, dsgvoMd]) => {
        const { marked } = await import("marked");
        setContent({
          about: await marked(aboutMd),
          services: await marked(servicesMd),
          imprint: await marked(imprintMd),
          dsgvo: await marked(dsgvoMd),
        });
      })
      .catch(() => {
        const err = "<p>Content unavailable.</p>";
        setContent({ about: err, services: err, imprint: err, dsgvo: err });
      })
      .finally(() => setIsLoading(false));
  }, [isOpen, content]);

  // Measure active tab height for smooth height animation
  useLayoutEffect(() => {
    const ref = tabRefs.current[activeTab];
    if (ref) setContentHeight(ref.scrollHeight);
  }, [activeTab, content]);

  // ESC key — capture phase so it fires before page-level handlers
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        handleClose();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [isOpen, handleClose]);

  if (!isOpen) return null;

  const mdClasses = [
    "[&_h1]:text-white [&_h1]:text-xl [&_h1]:font-semibold [&_h1]:mb-3 [&_h1]:mt-0",
    "[&_h2]:text-white/90 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mb-2 [&_h2]:mt-6 [&_h2:first-child]:mt-0",
    "[&_h3]:text-white/80 [&_h3]:text-base [&_h3]:font-medium [&_h3]:mb-1 [&_h3]:mt-4",
    "[&_p]:text-white/60 [&_p]:text-base [&_p]:leading-relaxed [&_p]:mb-3",
    "[&_ul]:text-white/60 [&_ul]:text-base [&_ul]:pl-5 [&_ul]:mb-3 [&_ul]:space-y-1 [&_ul]:list-disc",
    "[&_ol]:text-white/60 [&_ol]:text-base [&_ol]:pl-5 [&_ol]:mb-3 [&_ol]:space-y-1 [&_ol]:list-decimal",
    "[&_li]:leading-relaxed",
    "[&_strong]:text-white/80 [&_strong]:font-medium",
    "[&_a]:text-[var(--color-accent,#a78bfa)] [&_a]:underline",
    "[&_hr]:border-white/10 [&_hr]:my-4",
    "[&>*:last-child]:mb-0",
  ].join(" ");

  const transitionClasses = "transition-all duration-[380ms] ease-out";
  const visibilityClasses = isVisible ? "opacity-100 scale-100" : "opacity-0 scale-[0.96]";

  return (
    <>
      {/* Backdrop — blur only, no dimming */}
      <div
        className={`fixed inset-0 backdrop-blur-sm z-50 transition-opacity duration-[380ms] ${isVisible ? "opacity-100" : "opacity-0"}`}
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Card */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="info-panel-title"
        className={`fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50
                   w-[560px] max-w-[calc(100vw-2rem)]
                   max-h-[60vh] flex flex-col
                   bg-white/[0.05] backdrop-blur-2xl border border-white/[0.08] rounded-2xl
                   shadow-2xl overflow-hidden
                   ${transitionClasses} ${visibilityClasses}`}
      >
        {/* Header: underline tabs + close */}
        <div className="flex items-end justify-between px-6 pt-5 flex-shrink-0">
          <div
            id="info-panel-title"
            role="tablist"
            className="flex gap-6 border-b border-white/[0.08] -mb-px"
          >
            {TABS.map(({ id, label }) => (
              <button
                key={id}
                role="tab"
                id={`tab-${id}`}
                aria-selected={activeTab === id}
                aria-controls={`panel-${id}`}
                onClick={() => setActiveTab(id)}
                className={`pb-3 text-base font-medium tracking-[-0.01em] transition-colors duration-150
                  border-b-2 -mb-px focus:outline-none
                  ${
                    activeTab === id
                      ? "text-white border-white/50"
                      : "text-white/30 border-transparent hover:text-white/55"
                  }`}
              >
                {label}
              </button>
            ))}
          </div>

          <button
            onClick={handleClose}
            aria-label="Close"
            className="mb-2 p-1.5 text-white/30 hover:text-white/70 transition-colors duration-150 rounded-lg focus:outline-none"
          >
            <FaXmark className="w-4 h-4" />
          </button>
        </div>

        {/* Animated content area */}
        <div
          className="overflow-hidden transition-[height] duration-300 ease-in-out relative flex-shrink-0"
          style={{ height: contentHeight > 0 ? contentHeight : "auto" }}
        >
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center py-10">
              <div className="w-5 h-5 rounded-full border-2 border-white/20 border-t-white/60 animate-spin" />
            </div>
          )}

          {TABS.map(({ id }) => (
            <div
              key={id}
              ref={(el) => { tabRefs.current[id] = el; }}
              id={`panel-${id}`}
              role="tabpanel"
              aria-labelledby={`tab-${id}`}
              className={`overflow-y-auto px-6 py-5 max-h-[calc(60vh-72px)]
                ${activeTab === id ? "" : "absolute inset-0 opacity-0 pointer-events-none"}`}
            >
              {content && (
                <div
                  className={mdClasses}
                  dangerouslySetInnerHTML={{ __html: content[id] }}
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
