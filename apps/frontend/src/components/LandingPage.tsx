import { useCallback, useEffect, useRef, useState } from "react";
import type { InputState } from "@/lib/types/app";
import { LocaleProvider, useT } from "@/i18n/context";
import { buildActiveConfig } from "@/lib/resolve/parsers";
import { useAlbumColors } from "@/hooks/useAlbumColors";
import { useAppState } from "@/hooks/useAppState";
import { useFlipAnimation } from "@/hooks/useFlipAnimation";
import { AppFooter } from "@/components/layout/AppFooter";
import { BrandName } from "@/components/ui/BrandName";
import { DisambiguationPanel } from "@/components/panels/DisambiguationPanel";
import { GradientBackground } from "@/components/background/GradientBackground";
import { HeroSection } from "@/components/layout/HeroSection";
import { HeroInput } from "@/components/input/HeroInput";
import { InfoPanel } from "@/components/panels/InfoPanel";
import { MediaCard } from "@/components/cards/MediaCard";
import { PageHeader } from "@/components/layout/PageHeader";
import { PlatformIconRow } from "@/components/platform/PlatformIconRow";
import { SparklingStars } from "@/components/background/SparklingStars";
import { Toast } from "@/components/ui/Toast";

function LandingPageInner() {
  const t = useT();

  const resultsPanelRef = useRef<HTMLDivElement>(null);
  const disambiguationRef = useRef<HTMLDivElement>(null);
  const searchFieldRef = useRef<HTMLDivElement>(null);

  const { albumColors, dynamicAccent, handleAlbumArtLoad, resetColors } = useAlbumColors();
  const { state, active, candidates, selectedCandidateId, errorMessage, showCompact, isClearing, isDisambiguating, handleSubmit, handleSelectCandidate, handleClear } =
    useAppState(resetColors);
  const { isReturning, capturePosition, triggerReturn } = useFlipAnimation(searchFieldRef);

  const [isFocused, setIsFocused] = useState(false);
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [exampleShortId, setExampleShortId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/random-example")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { shortId: string } | null) => { if (data?.shortId) setExampleShortId(data.shortId); })
      .catch(() => {});
  }, []);
  const [toast, setToast] = useState<{ message: string; variant: "success" | "error" | "info"; visible: boolean }>(
    { message: "", variant: "info", visible: false },
  );

  const baseInputState: InputState = isDisambiguating || isClearing ? "idle" : state.type === "result" ? "success" : state.type as InputState;
  const inputState = baseInputState === "idle" && isFocused ? "focused" : baseInputState;

  const focusActive = state.type === "result" ? state.active : null;
  const focusCandidates = state.type === "disambiguation" ? state.candidates : null;
  useEffect(() => { if (focusActive) resultsPanelRef.current?.focus(); }, [focusActive]);
  useEffect(() => { if (focusCandidates) disambiguationRef.current?.focus(); }, [focusCandidates]);

  const handleToastDismiss = useCallback(() => setToast((p) => ({ ...p, visible: false })), []);

  const handleClearAnimationEnd = useCallback(() => {
    capturePosition();
    triggerReturn();
    handleClear();
  }, [capturePosition, triggerReturn, handleClear]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && showCompact) { e.preventDefault(); handleClear(); }
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
                "--color-accent-hover": dynamicAccent.hover,
                "--color-accent-glow": dynamicAccent.glow,
                "--color-accent-contrast": dynamicAccent.contrastText,
              } as React.CSSProperties)
            : undefined
        }
      >
        <GradientBackground albumColors={albumColors} />
        <SparklingStars />

        <PageHeader showInfoButton onInfoClick={() => setIsInfoOpen(true)} />
        <InfoPanel isOpen={isInfoOpen} onClose={() => setIsInfoOpen(false)} />

        <div className="flex-1 flex flex-col items-center justify-center w-full">
          {!active && !candidates && (
            <HeroSection className={isReturning ? "animate-fade-in" : ""} />
          )}

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
              songName={active ? `${active.title} - ${active.artist}` : undefined}
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
              <DisambiguationPanel
                candidates={candidates}
                onSelect={handleSelectCandidate}
                onCancel={handleClear}
                selectedId={selectedCandidateId}
                loading={state.type === "disambiguation_loading"}
              />
            </div>
          )}

          {activeConfig && (
            <div
              ref={resultsPanelRef}
              tabIndex={-1}
              className={`outline-none w-full flex justify-center ${isClearing ? "animate-slide-out-down pointer-events-none" : ""}`}
              onAnimationEnd={isClearing ? handleClearAnimationEnd : undefined}
            >
              <MediaCard content={activeConfig} className="mt-6 sm:mt-8" />
            </div>
          )}

          {state.type === "idle" && (
            <div className={isReturning ? "animate-fade-in" : ""}>
              <PlatformIconRow />
            </div>
          )}
        </div>

        <Toast message={toast.message} variant={toast.variant} visible={toast.visible} onDismiss={handleToastDismiss} />
      </div>

      <AppFooter />
    </>
  );
}

export function LandingPage() {
  return (
    <LocaleProvider>
      <LandingPageInner />
    </LocaleProvider>
  );
}
