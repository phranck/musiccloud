import { InfoIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface SectionHeadingProps {
  children: React.ReactNode;
  info?: string;
}

export function SectionHeading({ children, info }: SectionHeadingProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (buttonRef.current?.contains(e.target as Node) || popoverRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  function handleToggle() {
    if (!open && buttonRef.current) {
      const r = buttonRef.current.getBoundingClientRect();
      setPos({ top: r.top, left: r.left + r.width / 2 });
    }
    setOpen((o) => !o);
  }

  return (
    <div className="flex items-center justify-between mb-3 px-2">
      <p
        className="text-sm uppercase tracking-widest text-text-secondary font-bold"
        style={{ fontFamily: "var(--font-condensed)" }}
      >
        {children}
      </p>
      {info && (
        <>
          <button
            ref={buttonRef}
            type="button"
            onClick={handleToggle}
            className="p-1 text-white/30 hover:text-white/60 transition-colors rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
            aria-label="Info"
          >
            <InfoIcon size={20} weight="duotone" />
          </button>
          {open &&
            createPortal(
              <div
                ref={popoverRef}
                className="fixed w-60 p-3 rounded-xl bg-surface-elevated border border-white/[0.10] shadow-xl z-[200] text-sm text-text-secondary leading-relaxed"
                style={{
                  top: pos.top,
                  left: pos.left,
                  transform: "translate(-50%, calc(-100% - 8px))",
                }}
              >
                {info}
              </div>,
              document.body,
            )}
        </>
      )}
    </div>
  );
}
