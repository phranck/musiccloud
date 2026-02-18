// Background
export { GradientBackground } from "@/components/background/GradientBackground";
export { SparklingStars } from "@/components/background/SparklingStars";

// Cards
export { GlassCard } from "@/components/cards/GlassCard";
export { MediaCard } from "@/components/cards/MediaCard";
export { SongInfo } from "@/components/cards/SongInfo";

// Input
export { HeroInput } from "@/components/input/HeroInput";
export type { InputState } from "@/components/input/HeroInput";

// Layout
export { AppFooter } from "@/components/layout/AppFooter";
export { HeroSection } from "@/components/layout/HeroSection";
export { PageHeader } from "@/components/layout/PageHeader";
export { PageHeaderIsland } from "@/components/layout/PageHeaderIsland";

// Navigation
export { LanguageSwitcher } from "@/components/navigation/LanguageSwitcher";

// Panels
export { DisambiguationPanel } from "@/components/panels/DisambiguationPanel";
export { InfoPanel } from "@/components/panels/InfoPanel";

// Platform
export { PlatformButton } from "@/components/platform/PlatformButton";
export { PlatformIcon } from "@/components/platform/PlatformIcon";
export { PlatformIconRow } from "@/components/platform/PlatformIconRow";

// Share
export { ShareButton } from "@/components/share/ShareButton";
export { SharePage } from "@/components/share/SharePage";
export type { SharePageData } from "@/components/share/SharePage";
export { SharePageCard } from "@/components/share/SharePageCard";

// UI
export { BrandName } from "@/components/ui/BrandName";
export { ErrorBoundary } from "@/components/ui/ErrorBoundary";
export { Toast } from "@/components/ui/Toast";

// LandingPage (root level – wraps LocaleProvider)
export { LandingPage } from "@/components/LandingPage";

// Types re-exported for external consumers
export type { PlatformLink } from "@/lib/types/platform";
export type { ShareContentConfiguration, SongContentConfiguration, AlbumContentConfiguration, MediaCardContentConfiguration } from "@/lib/types/media-card";
export type { DisambiguationCandidate } from "@/lib/types/disambiguation";
