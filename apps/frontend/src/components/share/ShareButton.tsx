import { CheckIcon, LinkSimpleIcon, ShareNetworkIcon, WarningIcon } from "@phosphor-icons/react";
import { type CSSProperties, useCallback, useState, useSyncExternalStore } from "react";
import { RecessedCard } from "@/components/cards/RecessedCard";
import { EmbossedButton } from "@/components/ui/EmbossedButton";
import { useT } from "@/i18n/context";
import { cn } from "@/lib/utils";

const subscribe = () => () => {};

interface ShareButtonProps {
  shareUrl: string;
  songTitle?: string;
  artistName?: string;
}

type ShareState = "idle" | "copied" | "error";

const MEDIA_CARD_BUTTON_RADIUS_STYLE = {
  "--neu-radius-base": "7px",
  "--neu-radius-sm": "11px",
} as CSSProperties;

export function ShareButton({ shareUrl, songTitle, artistName }: ShareButtonProps) {
  const t = useT();
  const [state, setState] = useState<ShareState>("idle");

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setState("copied");
    } catch {
      setState("error");
    }
    setTimeout(() => setState("idle"), 2000);
  }, [shareUrl]);

  const handleNativeShare = useCallback(async () => {
    if (!navigator.share) return;
    try {
      await navigator.share({
        title: songTitle ? `${songTitle}${artistName ? ` - ${artistName}` : ""}` : "Check out this song",
        url: shareUrl,
      });
    } catch {
      // User cancelled share
    }
  }, [shareUrl, songTitle, artistName]);

  const supportsNativeShare = useSyncExternalStore(
    subscribe,
    () => !!navigator.share,
    () => false,
  );

  return (
    <div className="flex gap-0.5">
      <RecessedCard className="p-[0.1875rem] flex-1" radius={{ base: "0.625rem", sm: "0.875rem" }}>
        <RecessedCard.Body>
          <EmbossedButton
            as="button"
            type="button"
            onClick={handleCopy}
            aria-label={t("share.copyLink")}
            className={cn(
              "flex w-full items-center justify-center gap-2",
              "mc-raised-control rounded-[7px] sm:rounded-[11px] font-bold text-[15px] tracking-[-0.01em]",
              "min-h-[50px]",
              state === "idle"
                ? [
                    // Background resolves through a sentinel CSS var: when the
                    // dynamic accent has been extracted from the album art (see
                    // ShareLayout), `--color-accent-resolved` is set and the
                    // button shows the accent. Until then the var is absent and
                    // the fallback keeps the button in the neutral embossed
                    // state — no "flash of default accent" on first paint.
                    "bg-[var(--color-accent-resolved,rgba(255,255,255,0.09))]",
                    "hover:bg-[var(--color-accent-hover-resolved,rgba(255,255,255,0.12))]",
                  ]
                : state === "copied"
                  ? "bg-success/20 text-success"
                  : "bg-error/20 text-error",
            )}
            style={
              state === "idle"
                ? ({
                    ...MEDIA_CARD_BUTTON_RADIUS_STYLE,
                    color: "var(--color-accent-contrast-resolved, var(--color-text-primary))",
                    // Embossed border tints: only meaningful once the accent has
                    // resolved. Before that, fall back to neutral whites/blacks
                    // so the border looks right on the raw embossed surface.
                    "--neu-light": "color-mix(in hsl, var(--color-accent-resolved, rgba(255,255,255,0.6)), white 40%)",
                    "--neu-shadow": "color-mix(in hsl, var(--color-accent-resolved, rgba(0,0,0,0.6)), black 65%)",
                    transition: "background-color 220ms ease-out, color 220ms ease-out",
                  } as React.CSSProperties)
                : state === "copied"
                  ? MEDIA_CARD_BUTTON_RADIUS_STYLE
                  : MEDIA_CARD_BUTTON_RADIUS_STYLE
            }
          >
            {state === "idle" && (
              <>
                <LinkSimpleIcon size={20} weight="duotone" />
                {t("share.shareLink")}
              </>
            )}
            {state === "copied" && (
              <>
                <CheckIcon size={16} weight="duotone" />
                {t("share.copied")}
              </>
            )}
            {state === "error" && (
              <>
                <WarningIcon size={16} weight="duotone" />
                {t("share.copyError")}
              </>
            )}
          </EmbossedButton>
        </RecessedCard.Body>
      </RecessedCard>

      {supportsNativeShare && (
        <RecessedCard className="p-[0.1875rem] flex-none" radius={{ base: "0.625rem", sm: "0.875rem" }}>
          <RecessedCard.Body>
            <EmbossedButton
              as="button"
              type="button"
              onClick={handleNativeShare}
              className="mc-raised-control rounded-[7px] sm:rounded-[11px] px-4 py-3"
              style={MEDIA_CARD_BUTTON_RADIUS_STYLE}
              aria-label={songTitle ? t("share.nativeShare", { title: songTitle }) : t("share.shareLink")}
            >
              <ShareNetworkIcon size={24} weight="duotone" className="text-text-primary" />
            </EmbossedButton>
          </RecessedCard.Body>
        </RecessedCard>
      )}
    </div>
  );
}
