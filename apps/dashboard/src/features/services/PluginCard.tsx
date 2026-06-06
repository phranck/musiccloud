import { DashboardButton, DashboardButtonVariant } from "@musiccloud/dashboard-ui";
import { PLATFORM_CONFIG, type PluginInfo } from "@musiccloud/shared";

import { useI18n } from "@/context/I18nContext";

interface PluginCardProps {
  plugin: PluginInfo;
  onToggle: (enabled: boolean) => void;
  disabled?: boolean;
}

const BadgeTone = {
  Neutral: "neutral",
  Accent: "accent",
  Warn: "warn",
  Muted: "muted",
} as const;

type BadgeTone = (typeof BadgeTone)[keyof typeof BadgeTone];

function Badge({ label, tone }: { label: string; tone: BadgeTone }) {
  const toneClass =
    tone === BadgeTone.Accent
      ? "border-green-500/30 text-green-500 bg-green-500/5"
      : tone === BadgeTone.Warn
        ? "border-amber-500/30 text-amber-500 bg-amber-500/5"
        : tone === BadgeTone.Muted
          ? "border-[var(--ds-border)] text-[var(--ds-text-muted)]"
          : "border-[var(--ds-border)] text-[var(--ds-text)]";
  return (
    <span className={`inline-flex items-center h-5 px-1.5 rounded-md text-[10px] font-medium border ${toneClass}`}>
      {label}
    </span>
  );
}

export function PluginCard({ plugin, onToggle, disabled }: PluginCardProps) {
  const { messages } = useI18n();
  const s = messages.services;
  const color = PLATFORM_CONFIG[plugin.id]?.color ?? "#888";

  const capabilityBadges: Array<{ label: string; active: boolean }> = [
    { label: s.capabilityTrack, active: true },
    { label: s.capabilityAlbum, active: plugin.hasAlbumSupport },
    { label: s.capabilityArtist, active: plugin.hasArtistSupport },
    { label: s.capabilityIsrc, active: plugin.capabilities.supportsIsrc },
    { label: s.capabilityPreview, active: plugin.capabilities.supportsPreview },
    { label: s.capabilityArtwork, active: plugin.capabilities.supportsArtwork },
  ];

  return (
    <div className="flex items-start gap-4 py-4 border-b border-[var(--ds-border)] last:border-0">
      <div aria-hidden="true" className="mt-1 w-3 h-3 rounded-full flex-none" style={{ backgroundColor: color }} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-medium text-sm text-[var(--ds-text)]">{plugin.displayName}</p>
          <Badge
            label={plugin.available ? s.availableLabel : s.credentialsMissingLabel}
            tone={plugin.available ? BadgeTone.Accent : BadgeTone.Warn}
          />
        </div>
        <p className="text-xs text-[var(--ds-text-muted)] mt-0.5">{plugin.description}</p>
        {plugin.missingEnv.length > 0 && (
          <p className="text-[11px] text-amber-500 mt-1">
            {s.missingEnvPrefix} {plugin.missingEnv.join(", ")}
          </p>
        )}
        <div className="flex flex-wrap gap-1 mt-2">
          {capabilityBadges
            .filter((b) => b.active)
            .map((b) => (
              <Badge key={b.label} label={b.label} tone={BadgeTone.Muted} />
            ))}
        </div>
      </div>
      <DashboardButton
        type="button"
        onClick={() => onToggle(!plugin.enabled)}
        disabled={disabled}
        aria-label={s.toggleAction}
        className="flex-none"
        variant={plugin.enabled ? DashboardButtonVariant.Success : DashboardButtonVariant.Neutral}
      >
        {plugin.enabled ? s.enabled : s.disabled}
      </DashboardButton>
    </div>
  );
}
