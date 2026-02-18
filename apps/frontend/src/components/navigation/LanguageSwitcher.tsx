import { useRef, useState } from "react";
import { useLocale } from "@/i18n/context";
import { LOCALE_META, LOCALES } from "@/i18n/locales";
import { useOutsideClick } from "@/hooks/useOutsideClick";

export function LanguageSwitcher() {
  const { locale, setLocale } = useLocale();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const close = () => setIsOpen(false);
  useOutsideClick(containerRef, isOpen, close);

  const current = LOCALE_META[locale];

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setIsOpen((o) => !o)}
        aria-label={`Language: ${current.label}`}
        aria-expanded={isOpen}
        className="p-2 opacity-40 hover:opacity-80 transition-opacity duration-150 rounded-lg focus:outline-none"
      >
        <span className="text-[18px] leading-none select-none">{current.flag}</span>
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-1 py-1 min-w-[160px] bg-[#1c1c1e]/95 backdrop-blur-2xl border border-white/[0.08] rounded-xl shadow-2xl overflow-hidden z-50">
          {LOCALES.map((code) => {
            const meta = LOCALE_META[code];
            const active = locale === code;
            return (
              <button
                key={code}
                onClick={() => { setLocale(code); setIsOpen(false); }}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors duration-100 focus:outline-none
                  ${active
                    ? "text-white bg-white/[0.08]"
                    : "text-white/50 hover:text-white hover:bg-white/[0.05]"
                  }`}
              >
                <span className="text-base leading-none select-none">{meta.flag}</span>
                <span className={active ? "font-medium" : ""}>{meta.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
