import { ENDPOINTS } from "@musiccloud/shared";
import { Component, lazy, type ReactNode, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { HeroInput } from "@/components/input/HeroInput";
import { AppFooter } from "@/components/layout/AppFooter";
import { HeroSection } from "@/components/layout/HeroSection";
import { PageHeader } from "@/components/layout/PageHeader";
import { BrandName } from "@/components/ui/BrandName";
import { useAlbumColors } from "@/hooks/useAlbumColors";
import { useAppState } from "@/hooks/useAppState";
import { useFlipAnimation } from "@/hooks/useFlipAnimation";
import { LocaleProvider, useT } from "@/i18n/context";
import { buildActiveConfig } from "@/lib/resolve/parsers";
import type { InputState } from "@/lib/types/app";

// Lazy-loaded panels — only pulled into the bundle when the user needs them.
// Fallback is `null` because each is only rendered behind a visibility flag anyway.
const DisambiguationPanel = lazy(() =>
  import("@/components/panels/DisambiguationPanel").then((m) => ({ default: m.DisambiguationPanel })),
);
const InfoPanel = lazy(() => import("@/components/panels/InfoPanel").then((m) => ({ default: m.InfoPanel })));
const ShareLayout = lazy(() => import("@/components/share/ShareLayout").then((m) => ({ default: m.ShareLayout })));
const Toast = lazy(() => import("@/components/ui/Toast").then((m) => ({ default: m.Toast })));
const PlatformIconRow = lazy(() =>
  import("@/components/platform/PlatformIconRow").then((m) => ({ default: m.PlatformIconRow })),
);

// Inline ErrorBoundary — avoids a second client:load island just to wrap the page.
interface EbStrings {
  title: string;
  message: string;
  reload: string;
}

const EB_STRINGS: Record<string, EbStrings> = {
  de: {
    title: "Etwas ist schiefgelaufen",
    message: "Ein unerwarteter Fehler ist aufgetreten. Bitte lade die Seite neu.",
    reload: "Seite neu laden",
  },
  fr: {
    title: "Une erreur s'est produite",
    message: "Une erreur inattendue s'est produite. Veuillez recharger la page.",
    reload: "Recharger la page",
  },
  it: {
    title: "Qualcosa è andato storto",
    message: "Si è verificato un errore imprevisto. Ricarica la pagina.",
    reload: "Ricarica la pagina",
  },
  es: {
    title: "Algo salió mal",
    message: "Ocurrió un error inesperado. Por favor, recarga la página.",
    reload: "Recargar la página",
  },
  pt: {
    title: "Algo correu mal",
    message: "Ocorreu um erro inesperado. Por favor, recarregue a página.",
    reload: "Recarregar página",
  },
  nl: {
    title: "Er is iets misgegaan",
    message: "Er is een onverwachte fout opgetreden. Probeer de pagina opnieuw te laden.",
    reload: "Pagina herladen",
  },
  tr: {
    title: "Bir şeyler ters gitti",
    message: "Beklenmedik bir hata oluştu. Lütfen sayfayı yeniden yükleyin.",
    reload: "Sayfayı yenile",
  },
  cs: {
    title: "Něco se pokazilo",
    message: "Došlo k neočekávané chybě. Zkuste prosím znovu načíst stránku.",
    reload: "Znovu načíst stránku",
  },
};

const EB_DEFAULT: EbStrings = {
  title: "Something went wrong",
  message: "An unexpected error occurred. Please try reloading the page.",
  reload: "Reload page",
};

function getEbStrings(): EbStrings {
  try {
    const locale = localStorage.getItem("mc:locale") ?? "en";
    return EB_STRINGS[locale] ?? EB_DEFAULT;
  } catch {
    return EB_DEFAULT;
  }
}

class LandingErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    if (import.meta.env.DEV) {
      console.error("[LandingErrorBoundary]", error.message, error.stack);
    }
  }

  render() {
    if (this.state.hasError) {
      const s = getEbStrings();
      return (
        <div className="min-h-screen flex flex-col items-center justify-center px-4 text-center">
          <h1 className="text-2xl font-bold text-text-primary mb-4">{s.title}</h1>
          <p className="text-text-secondary mb-6">{s.message}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-6 py-3 rounded-xl bg-accent text-white font-medium hover:bg-accent-hover transition-colors"
          >
            {s.reload}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Convert hex color to RGB string (e.g. "#FF5733" -> "255 87 51")
function hexToRgb(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return "40 168 216"; // fallback to default blue
  const r = parseInt(result[1], 16);
  const g = parseInt(result[2], 16);
  const b = parseInt(result[3], 16);
  return `${r} ${g} ${b}`;
}

function LandingPageInner() {
  const t = useT();

  const resultsPanelRef = useRef<HTMLDivElement>(null);
  const disambiguationRef = useRef<HTMLDivElement>(null);
  const searchFieldRef = useRef<HTMLDivElement>(null);

  const { dynamicAccent, handleAlbumArtLoad, resetColors } = useAlbumColors();
  const {
    state,
    active,
    candidates,
    selectedCandidateId,
    errorMessage,
    showCompact,
    isClearing,
    isDisambiguating,
    handleSubmit,
    handleSelectCandidate,
    handleClear,
  } = useAppState(resetColors);
  const { isReturning, capturePosition, triggerReturn } = useFlipAnimation(searchFieldRef);

  const [isFocused, setIsFocused] = useState(false);
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [exampleShortId, setExampleShortId] = useState<string | null>(null);

  // Auto-submit when ?url= query param is present (e.g. from ArtistInfoCard Listen buttons)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlParam = params.get("url");
    if (urlParam) {
      window.history.replaceState({}, "", window.location.pathname);
      handleSubmit(urlParam);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleSubmit]);

  useEffect(() => {
    fetch(ENDPOINTS.frontend.randomExample)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { shortId: string } | null) => {
        if (data?.shortId) setExampleShortId(data.shortId);
      })
      .catch(() => {});
  }, []);
  const [toast, setToast] = useState<{ message: string; variant: "success" | "error" | "info"; visible: boolean }>({
    message: "",
    variant: "info",
    visible: false,
  });

  const baseInputState: InputState =
    isDisambiguating || isClearing ? "idle" : state.type === "result" ? "success" : (state.type as InputState);
  const inputState = baseInputState === "idle" && isFocused ? "focused" : baseInputState;

  const focusActive = state.type === "result" ? state.active : null;
  const focusCandidates = state.type === "disambiguation" ? state.candidates : null;
  useEffect(() => {
    if (focusActive) resultsPanelRef.current?.focus();
  }, [focusActive]);
  useEffect(() => {
    if (focusCandidates) disambiguationRef.current?.focus();
  }, [focusCandidates]);

  const handleToastDismiss = useCallback(() => setToast((p) => ({ ...p, visible: false })), []);

  const handleClearAnimationEnd = useCallback(() => {
    capturePosition();
    triggerReturn();
    handleClear();
  }, [capturePosition, triggerReturn, handleClear]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && showCompact) {
        e.preventDefault();
        handleClear();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [showCompact, handleClear]);

  const activeConfig = active ? buildActiveConfig(active, t, handleAlbumArtLoad) : null;

  return (
    <>
      <div
        className="flex-1 flex flex-col items-center px-4 transition-colors duration-700 relative"
        style={
          dynamicAccent
            ? ({
                "--color-accent": dynamicAccent.base,
                "--color-accent-rgb": hexToRgb(dynamicAccent.base),
                "--color-accent-hover": dynamicAccent.hover,
                "--color-accent-glow": dynamicAccent.glow,
                "--color-accent-contrast": dynamicAccent.contrastText,
              } as React.CSSProperties)
            : undefined
        }
      >
        <PageHeader showInfoButton onInfoClick={() => setIsInfoOpen(true)} />
        <Suspense fallback={null}>
          <InfoPanel isOpen={isInfoOpen} onClose={() => setIsInfoOpen(false)} />
        </Suspense>

        <div className="flex-1 flex flex-col items-center justify-center w-full">
          {!active && !candidates && <HeroSection className={isReturning ? "animate-fade-in" : ""} />}

          {showCompact && (
            <h1 className="text-3xl font-bold tracking-[-0.04em] text-text-primary mb-6">
              <BrandName />
            </h1>
          )}

          <div ref={searchFieldRef} className="w-full flex flex-col items-center">
            <HeroInput
              onSubmit={handleSubmit}
              onClear={handleClear}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              state={inputState}
              compact={showCompact}
              songName={
                active ? (active.kind === "artist" ? active.name : `${active.title} - ${active.artist}`) : undefined
              }
              errorMessage={errorMessage}
            />
          </div>

          {state.type === "idle" && exampleShortId && (
            <p className="mt-4 text-sm text-text-secondary text-center">
              {t("landing.exampleTeaser")}{" "}
              <a
                href={`/${exampleShortId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:text-[var(--color-accent-hover)] transition-colors"
              >
                {t("landing.exampleLink")}
              </a>
            </p>
          )}

          <div className="sr-only" aria-live="polite" aria-atomic="true">
            {active?.kind === "song" ? t("results.found", { title: active.title, artist: active.artist }) : ""}
          </div>

          {candidates && candidates.length > 0 && (
            <div ref={disambiguationRef} tabIndex={-1} className="outline-none w-full">
              <Suspense fallback={null}>
                <DisambiguationPanel
                  candidates={candidates}
                  onSelect={handleSelectCandidate}
                  onCancel={handleClear}
                  selectedId={selectedCandidateId}
                  loading={state.type === "disambiguation_loading"}
                />
              </Suspense>
            </div>
          )}

          {activeConfig && active && (
            <div
              ref={resultsPanelRef}
              tabIndex={-1}
              className={`outline-none w-full ${isClearing ? "animate-slide-out-down pointer-events-none" : ""}`}
              onAnimationEnd={isClearing ? handleClearAnimationEnd : undefined}
            >
              <div className="mt-6 sm:mt-8">
                <Suspense fallback={null}>
                  <ShareLayout
                    config={activeConfig}
                    artistName={active.kind === "artist" ? active.name : active.artist}
                    animated
                  />
                </Suspense>
              </div>
            </div>
          )}
        </div>

        {state.type === "idle" && (
          <Suspense fallback={null}>
            <div className={isReturning ? "animate-fade-in" : ""}>
              <PlatformIconRow />
            </div>
          </Suspense>
        )}

        <Suspense fallback={null}>
          <Toast
            message={toast.message}
            variant={toast.variant}
            visible={toast.visible}
            onDismiss={handleToastDismiss}
          />
        </Suspense>
      </div>

      <AppFooter />
    </>
  );
}

export function LandingPage() {
  return (
    <LandingErrorBoundary>
      <LocaleProvider>
        <LandingPageInner />
      </LocaleProvider>
    </LandingErrorBoundary>
  );
}
